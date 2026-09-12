import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import type { User } from "@clerk/backend";
import { clientAccessCleanupTable, clientMembersTable, clientsTable, db } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  CLIENT_MEMBER_PROFILE_LOOKUP_CONCURRENCY,
  clerkErrorResponse,
  createUsersRouter,
  revokeClientMemberships,
} from "./users";
import { ObjectStorageService } from "../lib/objectStorage";

type Role = "Admin" | "Project Manager" | "Field Team" | "Client";

function makeUser(id: string, role: Role, email = `${id}@example.com`): User {
  return {
    id,
    firstName: id === "admin" ? "Ada" : "Morgan",
    lastName: "Builder",
    fullName: id === "admin" ? "Ada Builder" : "Morgan Builder",
    username: null,
    primaryEmailAddress: { emailAddress: email },
    publicMetadata: { role },
    createdAt: 1,
    lastSignInAt: null,
    imageUrl: "https://example.com/avatar.png",
  } as unknown as User;
}

function fakeClerk(
  seed: User[],
  options: { getUserDelayMs?: number; unavailableUserIds?: Set<string> } = {},
) {
  let users = [...seed];
  let activeUserLookups = 0;
  let maxConcurrentUserLookups = 0;
  let beforeUserLookup: ((id: string, user: User | undefined) => Promise<void>) | undefined;
  const invitations: Array<{ emailAddress: string; publicMetadata?: object }> = [];
  let invitationRecords: Array<{
    id: string;
    emailAddress: string;
    publicMetadata: object;
    status: string;
    createdAt: number;
  }> = [{
    id: "inv_pending",
    emailAddress: "pending@example.com",
    publicMetadata: { role: "Client" },
    status: "pending",
    createdAt: 100,
  }];
  let invitationSequence = 1;
  const client = {
    users: {
      getUser: async (id: string) => {
        activeUserLookups += 1;
        maxConcurrentUserLookups = Math.max(maxConcurrentUserLookups, activeUserLookups);
        try {
          if (options.getUserDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.getUserDelayMs));
          }
          if (options.unavailableUserIds?.has(id)) throw { status: 503 };
          const user = users.find((candidate) => candidate.id === id);
          await beforeUserLookup?.(id, user);
          if (!user) throw { status: 404 };
          return user;
        } finally {
          activeUserLookups -= 1;
        }
      },
      getUserList: async (params?: { limit?: number; offset?: number }) => {
        const limit = params?.limit ?? 100;
        const offset = params?.offset ?? 0;
        return {
          data: users.slice(offset, offset + limit),
          totalCount: users.length,
        };
      },
      updateUserMetadata: async (id: string, input: { publicMetadata?: Record<string, unknown> }) => {
        const user = await client.users.getUser(id);
        Object.assign(user, { publicMetadata: input.publicMetadata ?? {} });
        return user;
      },
      updateUser: async (id: string, input: { firstName?: string; lastName?: string }) => {
        const user = await client.users.getUser(id);
        Object.assign(user, input, {
          fullName: [input.firstName ?? user.firstName, input.lastName ?? user.lastName].filter(Boolean).join(" "),
        });
        return user;
      },
      replaceUserEmailAddress: async (id: string, input: { emailAddress: string }) => {
        const user = await client.users.getUser(id);
        Object.assign(user, { primaryEmailAddress: { emailAddress: input.emailAddress } });
        return user.primaryEmailAddress;
      },
      deleteUser: async (id: string) => {
        users = users.filter((user) => user.id !== id);
        return { id, object: "user", deleted: true };
      },
    },
    invitations: {
      getInvitationList: async (params?: { status?: string; query?: string }) => {
        const data = invitationRecords.filter((invitation) =>
          (!params?.status || invitation.status === params.status)
          && (!params?.query || invitation.id.includes(params.query) || invitation.emailAddress.includes(params.query)),
        );
        return { data, totalCount: data.length };
      },
      createInvitation: async (input: { emailAddress: string; publicMetadata?: object }) => {
        invitations.push(input);
        const invitation = {
          id: `inv_${invitationSequence++}`,
          emailAddress: input.emailAddress,
          publicMetadata: input.publicMetadata ?? {},
          status: "pending",
          createdAt: 200 + invitationSequence,
        };
        invitationRecords.unshift(invitation);
        return invitation;
      },
      revokeInvitation: async (id: string) => {
        const invitation = invitationRecords.find((candidate) => candidate.id === id);
        if (!invitation || invitation.status !== "pending") throw { status: 404 };
        invitation.status = "revoked";
        return invitation;
      },
    },
  };
  return {
    client,
    invitations,
    getUsers: () => users,
    getInvitations: () => invitationRecords,
    getMaxConcurrentUserLookups: () => maxConcurrentUserLookups,
    setBeforeUserLookup: (hook: typeof beforeUserLookup) => {
      beforeUserLookup = hook;
    },
  };
}

class FakeLogoStorage extends ObjectStorageService {
  readonly deleted: string[] = [];
  readonly aclPaths: string[] = [];
  nextPath = "/objects/uploads/client-logo";
  beforeVerify?: () => Promise<void>;

  override async getObjectEntityUploadURL() {
    return `https://signed.example${this.nextPath}`;
  }

  override normalizeObjectEntityPath() {
    return this.nextPath;
  }

  override async verifyClientLogo() {
    await this.beforeVerify?.();
  }

  override async setAcl(objectPath: string) {
    this.aclPaths.push(objectPath);
  }

  override async deleteObject(objectPath: string) {
    this.deleted.push(objectPath);
  }
}

const servers: Server[] = [];
const testClientIds = new Set<string>();

afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  const clientIds = [...testClientIds];
  testClientIds.clear();
  if (clientIds.length) {
    await db.delete(clientMembersTable).where(inArray(clientMembersTable.clientId, clientIds));
    await db.delete(clientsTable).where(inArray(clientsTable.id, clientIds));
  }
});

async function startApi(
  actorId: string,
  client: ReturnType<typeof fakeClerk>["client"],
  lock: Parameters<typeof createUsersRouter>[1] = async (operation) => operation(),
  organizationId = "default",
  revokeMemberships: Parameters<typeof createUsersRouter>[2] = revokeClientMemberships,
  logoStorage?: ObjectStorageService,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const auth = Object.assign(
      () => ({ userId: actorId, orgId: organizationId, tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, {
      userId: actorId,
      auth,
      log: { warn: () => undefined, error: () => undefined },
    });
    next();
  });
  app.use(createUsersRouter(
    client as unknown as Parameters<typeof createUsersRouter>[0],
    lock,
    revokeMemberships,
    logoStorage,
  ));
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createTestClient(base: string, name: string) {
  const response = await fetch(`${base}/clients`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const payload = await response.text();
  assert.equal(response.status, 201, payload);
  const client = JSON.parse(payload) as { id: string; name: string; members: unknown[] };
  testClientIds.add(client.id);
  return client;
}

async function grantClientAccess(base: string, clientId: string, userId: string) {
  return fetch(`${base}/clients/${clientId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

test("blocks non-administrators from listing and mutating users", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Field Team")]);
  const base = await startApi("member", fake.client);
  assert.equal((await fetch(`${base}/users`)).status, 403);
  assert.equal((await fetch(`${base}/users/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new@example.com", role: "Client" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/users/invitations`)).status, 403);
  assert.equal((await fetch(`${base}/users/invitations/inv_pending/resend`, { method: "POST" })).status, 403);
  assert.equal((await fetch(`${base}/users/invitations/inv_pending`, { method: "DELETE" })).status, 403);
  assert.equal((await fetch(`${base}/users/admin`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Client" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/users/admin`, { method: "DELETE" })).status, 403);
});

test("lists, resends, and revokes pending invitations", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin")]);
  const base = await startApi("admin", fake.client);

  const listed = await fetch(`${base}/users/invitations`);
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [{
    id: "inv_pending",
    email: "pending@example.com",
    role: "Client",
    status: "pending",
    createdAt: 100,
  }]);

  const resent = await fetch(`${base}/users/invitations/inv_pending/resend`, { method: "POST" });
  assert.equal(resent.status, 200);
  assert.deepEqual(fake.invitations.at(-1), {
    emailAddress: "pending@example.com",
    publicMetadata: { role: "Client" },
    notify: true,
    ignoreExisting: true,
  });
  assert.equal(fake.getInvitations().find((invitation) => invitation.id === "inv_pending")?.status, "revoked");

  const replacement = await resent.json() as { id: string };
  assert.equal((await fetch(`${base}/users/invitations/${replacement.id}`, { method: "DELETE" })).status, 204);
  assert.equal(fake.getInvitations().find((invitation) => invitation.id === replacement.id)?.status, "revoked");
});

test("returns useful errors when Clerk invitation actions fail", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin")]);
  const client = fake.client;
  client.invitations.getInvitationList = async () => {
    throw { status: 503, errors: [{ longMessage: "Invitation service unavailable." }] };
  };
  const base = await startApi("admin", client);
  const listFailure = await fetch(`${base}/users/invitations`);
  assert.equal(listFailure.status, 502);
  assert.deepEqual(await listFailure.json(), { error: "Invitation service unavailable." });

  client.invitations.getInvitationList = async () => ({
    data: fake.getInvitations().filter((invitation) => invitation.status === "pending"),
    totalCount: 1,
  });
  client.invitations.revokeInvitation = async () => {
    throw { status: 404 };
  };
  const revokeFailure = await fetch(`${base}/users/invitations/inv_pending`, { method: "DELETE" });
  assert.equal(revokeFailure.status, 404);
  assert.deepEqual(await revokeFailure.json(), { error: "Invitation not found" });
});

test("validates invitations and passes the initial role to Clerk", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin")]);
  const base = await startApi("admin", fake.client);
  const invalid = await fetch(`${base}/users/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", role: "Client" }),
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(`${base}/users/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: " New.User@example.com ", role: "Project Manager" }),
  });
  assert.equal(valid.status, 201);
  assert.deepEqual(fake.invitations[0], {
    emailAddress: "new.user@example.com",
    publicMetadata: { role: "Project Manager" },
    notify: true,
    ignoreExisting: false,
  });
});

test("updates Clerk profile, email, and role together", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Client")]);
  const base = await startApi("admin", fake.client);
  const response = await fetch(`${base}/users/member`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: "Sam",
      lastName: "Foreman",
      email: "sam@example.com",
      role: "Field Team",
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: "member",
    firstName: "Sam",
    lastName: "Foreman",
    name: "Sam Foreman",
    email: "sam@example.com",
    role: "Field Team",
    createdAt: 1,
    lastSignInAt: null,
    imageUrl: "https://example.com/avatar.png",
    clientAccessCleanupPending: false,
  });
});

test("revokes all client memberships when a Client user is demoted", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("member", "Client"),
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-role-revoke");
  const firstClient = await createTestClient(base, "First Client");
  const secondClient = await createTestClient(base, "Second Client");
  await grantClientAccess(base, firstClient.id, "member");
  await grantClientAccess(base, secondClient.id, "member");

  const response = await fetch(`${base}/users/member`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Field Team" }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json() as { role: string }).role, "Field Team");
  assert.equal(fake.getUsers().find((user) => user.id === "member")?.publicMetadata.role, "Field Team");
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(inArray(
      clientMembersTable.clientId,
      [firstClient.id, secondClient.id],
    )),
    [],
  );

  const reassigned = await fetch(`${base}/users/member`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Client" }),
  });
  assert.equal(reassigned.status, 200);
  assert.equal((await reassigned.json() as { role: string }).role, "Client");
  assert.equal((await grantClientAccess(base, firstClient.id, "member")).status, 201);
});

test("reports failed client cleanup and retries the same demotion safely", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("member", "Client"),
  ]);
  let failCleanup = true;
  const base = await startApi(
    "admin",
    fake.client,
    undefined,
    "workspace-role-retry",
    async (userId, scope) => {
      if (failCleanup) {
        failCleanup = false;
        throw new Error("database unavailable");
      }
      await revokeClientMemberships(userId, scope);
    },
  );
  const client = await createTestClient(base, "Retry Client");
  await grantClientAccess(base, client.id, "member");

  const demotion = () => fetch(`${base}/users/member`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Field Team" }),
  });

  const failed = await demotion();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), {
    error: "The role was updated, but client access cleanup failed. Retry this role change to finish removing access.",
  });
  assert.equal(fake.getUsers().find((user) => user.id === "member")?.publicMetadata.role, "Field Team");
  assert.equal(
    (await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id))).length,
    1,
  );
  const listedAfterFailure = await (await fetch(`${base}/users`)).json() as Array<{
    id: string;
    clientAccessCleanupPending: boolean;
  }>;
  assert.equal(listedAfterFailure.find((user) => user.id === "member")?.clientAccessCleanupPending, true);

  const reconciled = await fetch(`${base}/users/member/client-access-reconciliation`, { method: "POST" });
  assert.equal(reconciled.status, 204);
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );
  const listedAfterReconciliation = await (await fetch(`${base}/users`)).json() as Array<{
    id: string;
    clientAccessCleanupPending: boolean;
  }>;
  assert.equal(listedAfterReconciliation.find((user) => user.id === "member")?.clientAccessCleanupPending, false);

  const retried = await demotion();
  assert.equal(retried.status, 200);
  assert.equal((await retried.json() as { role: string }).role, "Field Team");
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );

  const repeated = await demotion();
  assert.equal(repeated.status, 200);
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );
});

test("lists pending client cleanup for users beyond Clerk's first page", async () => {
  const pendingUser = makeUser("pending-beyond-first-page", "Field Team");
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    ...Array.from({ length: 100 }, (_, index) => makeUser(`workspace-user-${index}`, "Field Team")),
    pendingUser,
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-pending-large");

  await db.insert(clientAccessCleanupTable).values({
    workspaceId: "workspace-pending-large",
    userId: pendingUser.id,
  });

  const response = await fetch(`${base}/users`);
  assert.equal(response.status, 200);
  const users = await response.json() as Array<{
    id: string;
    clientAccessCleanupPending: boolean;
  }>;
  assert.equal(users.length, 102);
  assert.equal(users.find((user) => user.id === pendingUser.id)?.clientAccessCleanupPending, true);

  const reconciled = await fetch(`${base}/users/${pendingUser.id}/client-access-reconciliation`, { method: "POST" });
  assert.equal(reconciled.status, 204);
  assert.deepEqual(
    await db.select().from(clientAccessCleanupTable).where(eq(clientAccessCleanupTable.workspaceId, "workspace-pending-large")),
    [],
  );
});

test("reconciles all pending client cleanups independently", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("member", "Field Team"),
    makeUser("failed-member", "Field Team"),
  ], { unavailableUserIds: new Set(["failed-member"]) });
  const workspace = "workspace-bulk-reconciliation";
  const base = await startApi("admin", fake.client, undefined, workspace);
  const client = await createTestClient(base, "Bulk Retry Client");
  await grantClientAccess(base, client.id, "member");
  await db.insert(clientAccessCleanupTable).values([
    { workspaceId: workspace, userId: "member" },
    { workspaceId: workspace, userId: "failed-member" },
  ]);

  const response = await fetch(`${base}/users/client-access-reconciliation`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    reconciled: ["member"],
    failed: [{
      userId: "failed-member",
      error: "Client access cleanup failed again. Try reconciling this user again.",
    }],
  });
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );
  assert.deepEqual(
    await db.select({ userId: clientAccessCleanupTable.userId })
      .from(clientAccessCleanupTable)
      .where(eq(clientAccessCleanupTable.workspaceId, workspace)),
    [{ userId: "failed-member" }],
  );
  await db.delete(clientAccessCleanupTable).where(eq(clientAccessCleanupTable.workspaceId, workspace));
});

test("rejects empty and unknown-only profile updates", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Client")]);
  const base = await startApi("admin", fake.client);
  for (const body of [{}, { unsupported: "value" }]) {
    const response = await fetch(`${base}/users/member`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});

test("protects self-deletion and the final administrator role", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Client")]);
  const base = await startApi("admin", fake.client);
  assert.equal((await fetch(`${base}/users/admin`, { method: "DELETE" })).status, 403);

  const demotion = await fetch(`${base}/users/admin`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: "Changed",
      lastName: "Identity",
      email: "changed@example.com",
      role: "Project Manager",
    }),
  });
  assert.equal(demotion.status, 403);
  assert.equal(fake.getUsers()[0].publicMetadata.role, "Admin");
  assert.equal(fake.getUsers()[0].fullName, "Ada Builder");
  assert.equal(fake.getUsers()[0].primaryEmailAddress?.emailAddress, "admin@example.com");
});

test("deletes a confirmed target and revokes all of their client memberships", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("member", "Client"),
    makeUser("other-client", "Client"),
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-delete-user-check");
  const firstClient = await createTestClient(base, "First Delete User Client");
  const secondClient = await createTestClient(base, "Second Delete User Client");
  const otherWorkspace = await startApi("admin", fake.client, undefined, "workspace-delete-user-other");
  const thirdClient = await createTestClient(otherWorkspace, "Third Delete User Client");
  await grantClientAccess(base, firstClient.id, "member");
  await grantClientAccess(base, secondClient.id, "member");
  await grantClientAccess(base, firstClient.id, "other-client");
  await grantClientAccess(otherWorkspace, thirdClient.id, "member");

  assert.equal((await fetch(`${base}/users/member`, { method: "DELETE" })).status, 204);
  assert.deepEqual(fake.getUsers().map((user) => user.id), ["admin", "other-client"]);
  assert.deepEqual(
    await db.select({
      clientId: clientMembersTable.clientId,
      userId: clientMembersTable.userId,
      addedBy: clientMembersTable.addedBy,
    }).from(clientMembersTable).where(inArray(
      clientMembersTable.clientId,
      [firstClient.id, secondClient.id, thirdClient.id],
    )),
    [{ clientId: firstClient.id, userId: "other-client", addedBy: "admin" }],
  );
  assert.deepEqual(
    clerkErrorResponse({ status: 422, errors: [{ code: "form_identifier_exists", longMessage: "Email already exists." }] }, "failed"),
    { status: 409, error: "Email already exists." },
  );
});

test("serializes client access grants with workspace-user deletion", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("member", "Client"),
    makeUser("other-client", "Client"),
  ]);
  let lockCalls = 0;
  let secondLockCall!: () => void;
  const deletionQueued = new Promise<void>((resolve) => {
    secondLockCall = resolve;
  });
  let releaseMemberLookup!: () => void;
  const memberLookupReleased = new Promise<void>((resolve) => {
    releaseMemberLookup = resolve;
  });
  let startMemberLookup!: () => void;
  const memberLookupStarted = new Promise<void>((resolve) => {
    startMemberLookup = resolve;
  });
  let pausedMemberLookup = false;
  fake.setBeforeUserLookup(async (id, user) => {
    if (id === "member" && user && !pausedMemberLookup) {
      pausedMemberLookup = true;
      startMemberLookup();
      await memberLookupReleased;
    }
  });
  let tail = Promise.resolve();
  const lock: NonNullable<Parameters<typeof createUsersRouter>[1]> = async (operation) => {
    lockCalls += 1;
    if (lockCalls === 2) secondLockCall();
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const base = await startApi("admin", fake.client, lock, "workspace-user-race");
  const client = await createTestClient(base, "Workspace User Race Client");
  assert.equal((await grantClientAccess(base, client.id, "other-client")).status, 201);
  lockCalls = 0;

  const grant = grantClientAccess(base, client.id, "member");
  await memberLookupStarted;
  const deletion = fetch(`${base}/users/member`, { method: "DELETE" });
  await deletionQueued;
  releaseMemberLookup();

  const [grantResponse, deletionResponse] = await Promise.all([grant, deletion]);
  assert.equal(grantResponse.status, 201);
  assert.equal(deletionResponse.status, 204);
  assert.deepEqual(fake.getUsers().map((user) => user.id), ["admin", "other-client"]);
  assert.deepEqual(
    await db.select({
      userId: clientMembersTable.userId,
      addedBy: clientMembersTable.addedBy,
    }).from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [{ userId: "other-client", addedBy: "admin" }],
  );
});

test("returns a clear failure when a deleted workspace user is granted access", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("member", "Client"),
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-user-gone");
  const client = await createTestClient(base, "Workspace User Gone Client");

  assert.equal((await fetch(`${base}/users/member`, { method: "DELETE" })).status, 204);
  const response = await grantClientAccess(base, client.id, "member");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Workspace user not found" });
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );
});

test("serializes concurrent admin removal so one administrator remains", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("second-admin", "Admin")]);
  let tail = Promise.resolve();
  const lock: NonNullable<Parameters<typeof createUsersRouter>[1]> = async (operation) => {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const base = await startApi("admin", fake.client, lock);
  const [demotion, deletion] = await Promise.all([
    fetch(`${base}/users/admin`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Project Manager" }),
    }),
    fetch(`${base}/users/second-admin`, { method: "DELETE" }),
  ]);
  assert.equal([demotion.status, deletion.status].filter((status) => status < 300).length, 1);
  assert.equal(fake.getUsers().filter((user) => user.publicMetadata.role === "Admin").length, 1);
});

test("isolates client organizations and memberships by workspace", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("client-a", "Client"),
    makeUser("client-b", "Client"),
  ]);
  const workspaceA = await startApi("admin", fake.client, undefined, "workspace-a");
  const workspaceB = await startApi("admin", fake.client, undefined, "workspace-b");
  const clientA = await createTestClient(workspaceA, "Workspace A Client");
  const clientB = await createTestClient(workspaceB, "Workspace B Client");

  const listedA = await fetch(`${workspaceA}/clients`);
  const listedB = await fetch(`${workspaceB}/clients`);
   const clientsA = await listedA.json() as Array<{ id: string }>;
   const clientsB = await listedB.json() as Array<{ id: string }>;
   assert.equal(clientsA.some((client) => client.id === clientA.id), true);
   assert.equal(clientsB.some((client) => client.id === clientB.id), true);
   assert.equal(clientsA.length, 2);
   assert.equal(clientsB.length, 2);

  assert.equal((await grantClientAccess(workspaceA, clientB.id, "client-a")).status, 404);
  assert.equal((await fetch(`${workspaceA}/clients/${clientB.id}/members/client-b`, {
    method: "DELETE",
  })).status, 404);
  const memberships = await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, clientB.id));
  assert.deepEqual(memberships, []);
});

test("keeps assigned users beyond the first Clerk page and valid memberships visible", async () => {
  const beyondFirstPage = makeUser("client-beyond-first-page", "Client");
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    ...Array.from({ length: 100 }, (_, index) => makeUser(`workspace-user-${index}`, "Field Team")),
    beyondFirstPage,
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-large-members");
  const client = await createTestClient(base, "Large Workspace Client");

  assert.equal((await grantClientAccess(base, client.id, beyondFirstPage.id)).status, 201);
  await db.insert(clientMembersTable).values({
    id: "stale-membership",
    clientId: client.id,
    userId: "deleted-clerk-user",
    addedBy: "admin",
  });

  const response = await fetch(`${base}/clients`);
  assert.equal(response.status, 200);
  const clients = await response.json() as Array<{
    members: Array<{ userId: string; name: string; email: string }>;
  }>;
  assert.equal(clients[0].members.length, 1);
  assert.equal(clients[0].members[0].userId, beyondFirstPage.id);
  assert.equal(clients[0].members[0].name, beyondFirstPage.fullName);
  assert.equal(clients[0].members[0].email, beyondFirstPage.primaryEmailAddress?.emailAddress);
});

test("bounds large profile lookups without dropping valid client memberships", async () => {
  const assignedUsers = Array.from({ length: CLIENT_MEMBER_PROFILE_LOOKUP_CONCURRENCY * 3 }, (_, index) =>
    makeUser(`assigned-client-${index}`, "Client"),
  );
  const temporarilyUnavailableUserId = "temporarily-unavailable";
  const fake = fakeClerk([makeUser("admin", "Admin"), ...assignedUsers], {
    getUserDelayMs: 10,
    unavailableUserIds: new Set([temporarilyUnavailableUserId]),
  });
  const base = await startApi("admin", fake.client, undefined, "workspace-bounded-lookups");
  const client = await createTestClient(base, "Bounded Lookup Client");
  await db.insert(clientMembersTable).values([
    ...assignedUsers.map((user, index) => ({
      id: `bounded-membership-${index}`,
      clientId: client.id,
      userId: user.id,
      addedBy: "admin",
    })),
    {
      id: "temporarily-unavailable-membership",
      clientId: client.id,
      userId: temporarilyUnavailableUserId,
      addedBy: "admin",
    },
  ]);

  const response = await fetch(`${base}/clients`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Unable to load client member profiles" });
  assert.equal(fake.getMaxConcurrentUserLookups(), CLIENT_MEMBER_PROFILE_LOOKUP_CONCURRENCY);
});

test("returns a clear error instead of dropping valid memberships during a profile lookup failure", async () => {
  const available = makeUser("available-client", "Client");
  const temporarilyUnavailable = makeUser("temporarily-unavailable-client", "Client");
  const fake = fakeClerk([makeUser("admin", "Admin"), available, temporarilyUnavailable]);
  const getUser = fake.client.users.getUser;
  let profileAvailable = false;
  fake.client.users.getUser = async (id: string) => {
    if (id === temporarilyUnavailable.id && !profileAvailable) {
      throw {
        status: 503,
        errors: [{ longMessage: "Clerk profile service is temporarily unavailable." }],
      };
    }
    return getUser(id);
  };
  const base = await startApi("admin", fake.client, undefined, "workspace-profile-failure");
  const client = await createTestClient(base, "Profile Failure Client");

  assert.equal((await grantClientAccess(base, client.id, available.id)).status, 201);
  await db.insert(clientMembersTable).values({
    id: "temporarily-unavailable-membership",
    clientId: client.id,
    userId: temporarilyUnavailable.id,
    addedBy: "admin",
  });

  const failure = await fetch(`${base}/clients`);
  assert.equal(failure.status, 502);
  assert.deepEqual(await failure.json(), {
    error: "Clerk profile service is temporarily unavailable.",
  });

  profileAvailable = true;
  const recovered = await fetch(`${base}/clients`);
  assert.equal(recovered.status, 200);
  const clients = await recovered.json() as Array<{
    id: string;
    members: Array<{ userId: string; name: string; email: string; role: string; addedAt: number }>;
  }>;
  const recoveredClient = clients.find((candidate) => candidate.id === client.id);
  assert(recoveredClient);
  assert.deepEqual(recoveredClient.members.map((member) => member.userId).sort(), [
    available.id,
    temporarilyUnavailable.id,
  ].sort());
  assert.equal(recoveredClient.members.find((member) => member.userId === available.id)?.role, "Client");
});

test("rejects granting client access to a non-Client workspace user", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("project-manager", "Project Manager"),
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-role-check");
  const client = await createTestClient(base, "Role Check Client");

  const response = await grantClientAccess(base, client.id, "project-manager");
  assert.equal(response.status, 403);
  const clients = await (await fetch(`${base}/clients`)).json() as Array<{ members: unknown[] }>;
  assert.deepEqual(clients[0].members, []);
});

test("rejects duplicate grants and revokes only the targeted membership", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("client-one", "Client"),
    makeUser("client-two", "Client"),
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-membership-check");
  const client = await createTestClient(base, "Membership Check Client");

  assert.equal((await grantClientAccess(base, client.id, "client-one")).status, 201);
  assert.equal((await grantClientAccess(base, client.id, "client-two")).status, 201);
  const duplicate = await grantClientAccess(base, client.id, "client-one");
  assert.equal(duplicate.status, 409);

  const revoke = await fetch(`${base}/clients/${client.id}/members/client-one`, { method: "DELETE" });
  assert.equal(revoke.status, 204);
  const remaining = await (await fetch(`${base}/clients`)).json() as Array<{ members: Array<{ userId: string }> }>;
  assert.deepEqual(remaining[0].members.map((member: { userId: string }) => member.userId), ["client-two"]);
  assert.equal((await fetch(`${base}/clients/${client.id}/members/client-one`, {
    method: "DELETE",
  })).status, 404);
});

test("deleting a client revokes memberships without deleting workspace users", async () => {
  const fake = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("client-one", "Client"),
    makeUser("client-two", "Client"),
  ]);
  const base = await startApi("admin", fake.client, undefined, "workspace-delete-check");
  const client = await createTestClient(base, "Delete Check Client");
  await grantClientAccess(base, client.id, "client-one");
  await grantClientAccess(base, client.id, "client-two");

  const deleted = await fetch(`${base}/clients/${client.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
   const remainingClients = await (await fetch(`${base}/clients`)).json() as Array<{ id: string; name: string }>;
   assert.equal(remainingClients.some((remaining) => remaining.id === client.id), false);
   assert.deepEqual(remainingClients.map((remaining) => remaining.name), ["Weidner Apartment Homes"]);
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );
  assert.deepEqual(fake.getUsers().map((user) => user.id), ["admin", "client-one", "client-two"]);
});

test("secures client logo uploads and cleans up replacement and clear", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Field Team")]);
  const storage = new FakeLogoStorage();
  const base = await startApi("admin", fake.client, undefined, "workspace-logo", revokeClientMemberships, storage);
  const client = await createTestClient(base, "Logo Lifecycle Client");

  const invalid = await fetch(`${base}/clients/${client.id}/logo-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "logo.gif", size: 12, contentType: "image/gif" }),
  });
  assert.equal(invalid.status, 400);

  const requestUpload = () => fetch(`${base}/clients/${client.id}/logo-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "logo.png", size: 12, contentType: "image/png" }),
  });
  assert.equal((await requestUpload()).status, 200);

  const wrongPath = await fetch(`${base}/clients/${client.id}/logo`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectPath: "/objects/uploads/not-issued" }),
  });
  assert.equal(wrongPath.status, 400);

  const attach = (objectPath: string) => fetch(`${base}/clients/${client.id}/logo`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectPath }),
  });
  const first = await attach(storage.nextPath);
  assert.equal(first.status, 200);
  assert.equal((await first.json() as { logoUrl: string }).logoUrl, `/api/storage${storage.nextPath}`);

  storage.nextPath = "/objects/uploads/replacement-logo";
  assert.equal((await requestUpload()).status, 200);
  assert.equal((await attach(storage.nextPath)).status, 200);
  assert.deepEqual(storage.deleted, ["/objects/uploads/client-logo"]);

  const otherWorkspace = await startApi(
    "admin",
    fake.client,
    undefined,
    "workspace-other",
    revokeClientMemberships,
    storage,
  );
  assert.equal((await fetch(`${otherWorkspace}/clients/${client.id}/logo`, { method: "DELETE" })).status, 404);

  const nonAdmin = await startApi(
    "member",
    fake.client,
    undefined,
    "workspace-logo",
    revokeClientMemberships,
    storage,
  );
  assert.equal((await fetch(`${nonAdmin}/clients/${client.id}/logo-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "logo.png", size: 12, contentType: "image/png" }),
  })).status, 403);

  const cleared = await fetch(`${base}/clients/${client.id}/logo`, { method: "DELETE" });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json() as { logoUrl: string | null }).logoUrl, null);
  assert.deepEqual(storage.deleted, ["/objects/uploads/client-logo", "/objects/uploads/replacement-logo"]);
});

test("keeps an attached logo when response serialization fails", async () => {
  const unavailableUserIds = new Set<string>();
  const fake = fakeClerk(
    [makeUser("admin", "Admin"), makeUser("member", "Client")],
    { unavailableUserIds },
  );
  const storage = new FakeLogoStorage();
  const base = await startApi(
    "admin",
    fake.client,
    undefined,
    "workspace-logo-response",
    revokeClientMemberships,
    storage,
  );
  const client = await createTestClient(base, "Logo Response Failure Client");
  await db.insert(clientMembersTable).values({
    id: "logo-response-member",
    clientId: client.id,
    userId: "member",
    addedBy: "admin",
  });
  assert.equal((await fetch(`${base}/clients/${client.id}/logo-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "logo.png", size: 12, contentType: "image/png" }),
  })).status, 200);
  unavailableUserIds.add("member");

  const attached = await fetch(`${base}/clients/${client.id}/logo`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectPath: storage.nextPath }),
  });
  assert.equal(attached.status, 500);
  const [stored] = await db.select({
    logoObjectPath: clientsTable.logoObjectPath,
    pendingLogoObjectPath: clientsTable.pendingLogoObjectPath,
  }).from(clientsTable).where(eq(clientsTable.id, client.id));
  assert.deepEqual(stored, { logoObjectPath: storage.nextPath, pendingLogoObjectPath: null });
  assert.equal(storage.deleted.includes(storage.nextPath), false);
});

test("rejects a stale logo attach without overwriting a newer pending upload", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin")]);
  const storage = new FakeLogoStorage();
  const base = await startApi(
    "admin",
    fake.client,
    undefined,
    "workspace-logo-race",
    revokeClientMemberships,
    storage,
  );
  const client = await createTestClient(base, "Logo Race Client");
  const stalePath = storage.nextPath;
  assert.equal((await fetch(`${base}/clients/${client.id}/logo-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "logo.png", size: 12, contentType: "image/png" }),
  })).status, 200);
  const newerPath = "/objects/uploads/newer-logo";
  storage.beforeVerify = async () => {
    await db.update(clientsTable)
      .set({ pendingLogoObjectPath: newerPath })
      .where(eq(clientsTable.id, client.id));
  };

  const staleAttach = await fetch(`${base}/clients/${client.id}/logo`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectPath: stalePath }),
  });
  assert.equal(staleAttach.status, 409);
  const [stored] = await db.select({
    logoObjectPath: clientsTable.logoObjectPath,
    pendingLogoObjectPath: clientsTable.pendingLogoObjectPath,
  }).from(clientsTable).where(eq(clientsTable.id, client.id));
  assert.deepEqual(stored, { logoObjectPath: null, pendingLogoObjectPath: newerPath });
  assert.deepEqual(storage.deleted, [stalePath]);
});
