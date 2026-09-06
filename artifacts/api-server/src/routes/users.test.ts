import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import type { User } from "@clerk/backend";
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
      createInvitation: async (input: { emailAddress: string; publicMetadata?: object }) => {
        invitations.push(input);
        return { id: "inv_1", emailAddress: input.emailAddress, status: "pending" };
      },
    },
  };
  return { client, invitations, getUsers: () => users };
}

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function startApi(
  actorId: string,
  client: ReturnType<typeof fakeClerk>["client"],
  lock: Parameters<typeof createUsersRouter>[1] = async (operation) => operation(),
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { userId: actorId, log: { warn: () => undefined } });
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

test("blocks non-administrators from listing and mutating users", async () => {
  const fake = fakeClerk([makeUser("admin", "Admin"), makeUser("member", "Field Team")]);
  const base = await startApi("member", fake.client);
  assert.equal((await fetch(`${base}/users`)).status, 403);
  assert.equal((await fetch(`${base}/users/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new@example.com", role: "Client" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/users/admin`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Client" }),
  })).status, 403);
  assert.equal((await fetch(`${base}/users/admin`, { method: "DELETE" })).status, 403);
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