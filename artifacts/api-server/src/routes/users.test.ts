import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import type { User } from "@clerk/backend";
import { clientMembersTable, clientsTable, db } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { clerkErrorResponse, createUsersRouter } from "./users";

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

function fakeClerk(seed: User[]) {
  let users = [...seed];
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
        const user = users.find((candidate) => candidate.id === id);
        if (!user) throw { status: 404 };
        return user;
      },
      getUserList: async () => ({ data: users, totalCount: users.length }),
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
  return { client, invitations, getUsers: () => users, getInvitations: () => invitationRecords };
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

test("deletes a confirmed target and normalizes Clerk conflicts", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Client")]);
  const base = await startApi("admin", fake.client);
  assert.equal((await fetch(`${base}/users/member`, { method: "DELETE" })).status, 204);
  assert.deepEqual(fake.getUsers().map((user) => user.id), ["admin"]);
  assert.deepEqual(
    clerkErrorResponse({ status: 422, errors: [{ code: "form_identifier_exists", longMessage: "Email already exists." }] }, "failed"),
    { status: 409, error: "Email already exists." },
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
  assert.deepEqual(clientsA.map((client) => client.id), [clientA.id]);
  assert.deepEqual(clientsB.map((client) => client.id), [clientB.id]);

  assert.equal((await grantClientAccess(workspaceA, clientB.id, "client-a")).status, 404);
  assert.equal((await fetch(`${workspaceA}/clients/${clientB.id}/members/client-b`, {
    method: "DELETE",
  })).status, 404);
  const memberships = await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, clientB.id));
  assert.deepEqual(memberships, []);
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
  assert.deepEqual((await (await fetch(`${base}/clients`)).json()), []);
  assert.deepEqual(
    await db.select().from(clientMembersTable).where(eq(clientMembersTable.clientId, client.id)),
    [],
  );
  assert.deepEqual(fake.getUsers().map((user) => user.id), ["admin", "client-one", "client-two"]);
});
