import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import type { ClerkClient, User } from "@clerk/backend";
import { db, importedProjectsTable, projectImportBatchesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import luminovaRouter from "./luminova";

type Role = "Admin" | "Project Manager" | "Field Team";

function makeUser(id: string, role: Role): User {
  return {
    id,
    firstName: id,
    lastName: "Builder",
    fullName: `${id} Builder`,
    username: null,
    primaryEmailAddress: { emailAddress: `${id}@example.com` },
    publicMetadata: { role },
    createdAt: 1,
    lastSignInAt: null,
    imageUrl: "",
  } as unknown as User;
}

function fakeClerk(users: User[]): ClerkClient {
  return {
    users: {
      getUser: async (userId: string) => {
        const user = users.find((candidate) => candidate.id === userId);
        if (!user) throw { status: 404 };
        return user;
      },
      getUserList: async () => ({ data: users, totalCount: users.length }),
    },
  } as ClerkClient;
}

const servers: Server[] = [];
const projectIds: string[] = [];
const batchIds: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  if (projectIds.length) {
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.id, projectIds.splice(0)));
  }
  if (batchIds.length) {
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds.splice(0)));
  }
});

async function startApi(client: ClerkClient, orgId: string | null = null) {
  const app = express();
  app.locals.projectAssignmentClerkClient = client;
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user") || undefined;
    const auth = Object.assign(
      () => ({ userId, orgId, tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, {
      userId,
      auth,
      log: { warn: () => undefined, error: () => undefined },
    });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

const projectInput = {
  name: "Assignment Test Project",
  address: "100 Test Avenue",
  region: "Calgary",
  status: "Planning",
  projectManagerId: "manager-one",
  clientName: "Test Client",
  startDate: "2026-01-01",
  targetDate: "2027-04-30",
  budgeted: 25000000,
  description: "Project manager assignment test.",
};

test("persists validated assignments and protects assignment changes", async () => {
  const client = fakeClerk([
    makeUser("admin", "Admin"),
    makeUser("manager-one", "Project Manager"),
    makeUser("manager-two", "Project Manager"),
    makeUser("field", "Field Team"),
  ]);
  const base = await startApi(client);

  const missing = await fetch(`${base}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify({ ...projectInput, projectManagerId: undefined }),
  });
  assert.equal(missing.status, 400);

  const createdResponse = await fetch(`${base}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify(projectInput),
  });
  const createdText = await createdResponse.text();
  assert.equal(createdResponse.status, 201, createdText);
  const created = JSON.parse(createdText) as { id: string; projectManagerId: string; pmName: string; startDate: string };
  projectIds.push(created.id);
  assert.equal(created.projectManagerId, "manager-one");
  assert.equal(created.pmName, "manager-one Builder");
  assert.equal(created.startDate, projectInput.startDate);

  const [stored] = await db.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, created.id));
  assert(stored);
  batchIds.push(stored.importBatchId);
  assert.equal((stored.data as typeof created).projectManagerId, "manager-one");

  const listed = await (await fetch(`${base}/projects`, {
    headers: { "x-test-user": "admin" },
  })).json() as Array<{ id: string; projectManagerId: string | null }>;
  assert.equal(listed.find((project) => project.id === created.id)?.projectManagerId, "manager-one");

  const updatedEndDate = "2026-12-31";
  const dateUpdatedResponse = await fetch(`${base}/projects/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify({ targetDate: updatedEndDate }),
  });
  const dateUpdated = await dateUpdatedResponse.json() as { targetDate: string; startDate: string; progress: number };
  assert.equal(dateUpdatedResponse.status, 200);
  assert.equal(dateUpdated.targetDate, updatedEndDate);
  assert.equal(dateUpdated.startDate, projectInput.startDate);
  assert.equal(dateUpdated.progress, 72.8);

  const forbidden = await fetch(`${base}/projects/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": "manager-one" },
    body: JSON.stringify({ projectManagerId: "manager-two" }),
  });
  assert.equal(forbidden.status, 403);

  const wrongRole = await fetch(`${base}/projects/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify({ projectManagerId: "field" }),
  });
  assert.equal(wrongRole.status, 400);

  const stale = await fetch(`${base}/projects/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify({ projectManagerId: "deleted-manager" }),
  });
  assert.equal(stale.status, 404);

  const updatedResponse = await fetch(`${base}/projects/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify({ projectManagerId: "manager-two" }),
  });
  const updatedText = await updatedResponse.text();
  assert.equal(updatedResponse.status, 200, updatedText);
  const updated = JSON.parse(updatedText) as { projectManagerId: string; pmName: string };
  assert.equal(updated.projectManagerId, "manager-two");
  assert.equal(updated.pmName, "manager-two Builder");

  const [persistedUpdate] = await db.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, created.id));
  assert.equal((persistedUpdate.data as typeof updated).projectManagerId, "manager-two");
  assert.equal((persistedUpdate.data as typeof updated).pmName, "manager-two Builder");
});

test("returns the legacy display name with a null assignment identity", async () => {
  const base = await startApi(fakeClerk([makeUser("admin", "Admin")]));
  const projectId = `legacy-assignment-${Date.now()}`;
  const batchId = `legacy-batch-${Date.now()}`;
  projectIds.push(projectId);
  batchIds.push(batchId);
  await db.insert(projectImportBatchesTable).values({
    id: batchId,
    projectId,
    ownerId: "admin",
    status: "completed",
    manifest: [],
  });
  await db.insert(importedProjectsTable).values({
    id: projectId,
    importBatchId: batchId,
    ownerId: "admin",
    data: {
      id: projectId,
      name: "Legacy Assignment",
      address: "1 Legacy Way",
      region: "Calgary",
      status: "Planning",
      progress: 0,
      pmName: "Legacy Manager",
      clientName: "Legacy Client",
      targetDate: "2027-01-01",
      budgeted: 100,
      invoiced: 0,
      exteriorImage: "",
      description: "Legacy record.",
    },
  });

  const response = await fetch(`${base}/projects/${projectId}`, {
    headers: { "x-test-user": "admin" },
  });
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const legacy = JSON.parse(responseText) as { projectManagerId: string | null; pmName: string };
  assert.equal(legacy.projectManagerId, null);
  assert.equal(legacy.pmName, "Legacy Manager");
});

test("rejects an existing Project Manager outside the active organization", async () => {
  const admin = makeUser("admin", "Admin");
  Object.assign(admin, {
    publicMetadata: {
      role: "Admin",
      workspaceIds: ["active-organization"],
      workspaceRoles: { "active-organization": "Admin" },
    },
  });
  const client = fakeClerk([
    admin,
    makeUser("outside-manager", "Project Manager"),
  ]);
  Object.assign(client, {
    organizations: {
      getOrganizationMembershipList: async () => ({
        data: [{ publicUserData: { userId: "admin" } }],
        totalCount: 1,
      }),
    },
  });
  const base = await startApi(client, "active-organization");

  const response = await fetch(`${base}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": "admin" },
    body: JSON.stringify({ ...projectInput, projectManagerId: "outside-manager" }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "The selected Project Manager is not a member of this workspace.",
  });
});