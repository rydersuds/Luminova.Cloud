import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import type { ClerkClient, User } from "@clerk/backend";
import {
  db,
  importedProjectsTable,
  importedVendorsTable,
  projectActivitiesTable,
  projectImportBatchesTable,
  standaloneVendorProfilesTable,
  vendorJobHistoryTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import luminovaRouter from "./luminova";

type Role = "Admin" | "Project Manager";

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
const importedVendorIds: string[] = [];
const activityIds: string[] = [];
const vendorHistoryIds: string[] = [];
const sharedProfileIds: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  if (activityIds.length) {
    await db.delete(projectActivitiesTable).where(inArray(projectActivitiesTable.id, activityIds.splice(0)));
  }
  if (vendorHistoryIds.length) {
    await db.delete(vendorJobHistoryTable).where(inArray(vendorJobHistoryTable.id, vendorHistoryIds.splice(0)));
  }
  if (importedVendorIds.length) {
    await db.delete(importedVendorsTable).where(inArray(importedVendorsTable.id, importedVendorIds.splice(0)));
  }
  if (sharedProfileIds.length) {
    await db.delete(standaloneVendorProfilesTable)
      .where(inArray(standaloneVendorProfilesTable.id, sharedProfileIds.splice(0)));
  }
  if (projectIds.length) {
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.id, projectIds.splice(0)));
  }
  if (batchIds.length) {
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds.splice(0)));
  }
});

async function startApi(client: ClerkClient) {
  const app = express();
  app.locals.projectAssignmentClerkClient = client;
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user") || undefined;
    const auth = Object.assign(
      () => ({ userId, orgId: null, tokenType: "session_token" }),
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

const projectData = (id: string) => ({
  id,
  name: `Lifecycle project ${id}`,
  address: "100 Test Avenue",
  region: "Calgary",
  status: "Planning",
  progress: 0,
  pmName: "Project Admin",
  projectManagerId: null,
  clientName: "Lifecycle Test Client",
  startDate: "2026-01-01",
  targetDate: "2026-12-31",
  budgetEnabled: true,
  budgetAmountUnit: "cents",
  budgeted: 100_000,
  invoiced: 0,
  exteriorImage: "",
  description: "Project lifecycle route test.",
});

async function insertProject(id: string, batchId: string, ownerId: string) {
  projectIds.push(id);
  batchIds.push(batchId);
  await db.insert(importedProjectsTable).values({
    id,
    importBatchId: batchId,
    ownerId,
    workspaceId: "default",
    data: projectData(id),
  });
}

async function requestAs(base: string, userId: string, path: string, init?: RequestInit) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-test-user": userId,
    },
  });
}

test("archive and restore are Administrator-only and keep records out of the active list", async () => {
  const adminId = `lifecycle-admin-${randomUUID()}`;
  const managerId = `lifecycle-manager-${randomUUID()}`;
  const projectId = `lifecycle-${randomUUID()}`;
  const batchId = `lifecycle-batch-${randomUUID()}`;
  const activityId = `lifecycle-archive-activity-${randomUUID()}`;
  const base = await startApi(fakeClerk([
    makeUser(adminId, "Admin"),
    makeUser(managerId, "Project Manager"),
  ]));
  await insertProject(projectId, batchId, adminId);
  activityIds.push(activityId);
  await db.insert(projectActivitiesTable).values({
    id: activityId,
    projectId,
    ownerId: adminId,
    type: "note",
    title: "Retained activity",
    description: "Archive must preserve project history.",
    author: "Project Admin",
  });

  assert.equal((await requestAs(base, managerId, `/projects/${projectId}/archive`, { method: "POST" })).status, 403);
  assert.equal((await requestAs(base, adminId, `/projects/${projectId}/archive`, { method: "POST" })).status, 204);

  const activeResponse = await requestAs(base, adminId, "/projects");
  assert.equal(activeResponse.status, 200);
  const activeProjects = await activeResponse.json() as Array<{ id: string }>;
  assert.equal(activeProjects.some((project) => project.id === projectId), false);

  assert.equal((await requestAs(base, managerId, "/projects?archived=true")).status, 403);
  const archivedResponse = await requestAs(base, adminId, "/projects?archived=true");
  assert.equal(archivedResponse.status, 200);
  const archivedProjects = await archivedResponse.json() as Array<{
    id: string;
    archivedAt?: string | null;
    canManageLifecycle?: boolean;
  }>;
  const archivedProject = archivedProjects.find((project) => project.id === projectId);
  assert(archivedProject?.archivedAt);
  assert.equal(archivedProject.canManageLifecycle, true);
  assert.equal((await requestAs(base, adminId, `/projects/${projectId}`)).status, 404);
  assert.equal((await requestAs(base, managerId, `/projects/${projectId}/archived`)).status, 403);
  const archivedDetailResponse = await requestAs(base, adminId, `/projects/${projectId}/archived`);
  assert.equal(archivedDetailResponse.status, 200);
  const archivedDetail = await archivedDetailResponse.json() as {
    id: string;
    archivedAt?: string | null;
  };
  assert.equal(archivedDetail.id, projectId);
  assert(archivedDetail.archivedAt);
  assert.equal((await requestAs(base, managerId, `/projects/${projectId}`, { method: "DELETE" })).status, 403);

  assert.equal((await requestAs(base, adminId, `/projects/${projectId}/restore`, { method: "POST" })).status, 204);
  const restoredResponse = await requestAs(base, adminId, "/projects");
  const restoredProjects = await restoredResponse.json() as Array<{ id: string }>;
  assert.equal(restoredProjects.some((project) => project.id === projectId), true);
  const [retainedActivity] = await db.select({ id: projectActivitiesTable.id })
    .from(projectActivitiesTable)
    .where(eq(projectActivitiesTable.id, activityId));
  assert(retainedActivity);
});

test("permanent deletion removes project data without deleting shared vendor profiles or other projects", async () => {
  const adminId = `lifecycle-admin-${randomUUID()}`;
  const projectId = `lifecycle-delete-${randomUUID()}`;
  const otherProjectId = `lifecycle-keep-${randomUUID()}`;
  const batchId = `lifecycle-delete-batch-${randomUUID()}`;
  const otherBatchId = `lifecycle-keep-batch-${randomUUID()}`;
  const vendorId = `lifecycle-shared-vendor-${randomUUID()}`;
  const importedVendorId = `lifecycle-imported-vendor-${randomUUID()}`;
  const activityId = `lifecycle-activity-${randomUUID()}`;
  const historyId = `lifecycle-history-${randomUUID()}`;
  const base = await startApi(fakeClerk([makeUser(adminId, "Admin")]));

  await insertProject(projectId, batchId, adminId);
  await insertProject(otherProjectId, otherBatchId, adminId);
  await db.insert(projectImportBatchesTable).values({
    id: batchId,
    projectId,
    ownerId: adminId,
    workspaceId: "default",
    status: "completed",
    manifest: [],
  });
  importedVendorIds.push(importedVendorId);
  await db.insert(importedVendorsTable).values({
    id: importedVendorId,
    importBatchId: batchId,
    ownerId: adminId,
    data: { id: importedVendorId, companyName: "Project-only vendor" },
  });
  activityIds.push(activityId);
  await db.insert(projectActivitiesTable).values({
    id: activityId,
    projectId,
    ownerId: adminId,
    type: "note",
    title: "Test activity",
    description: "Project-specific history",
    author: "Project Admin",
  });
  sharedProfileIds.push(vendorId);
  await db.insert(standaloneVendorProfilesTable).values({
    id: vendorId,
    workspaceId: "default",
    seedKey: `lifecycle-shared-${randomUUID()}`,
    data: {
      companyName: "Shared vendor",
      contactName: "Shared contact",
      tradeType: "General",
      specialties: [],
      region: "Calgary",
      regions: ["Calgary"],
      rating: 5,
      reviewCount: 1,
      completedJobs: 1,
      initials: "SV",
      accent: "blue",
      phone: "",
      email: "",
      website: "",
      licence: "",
      insurance: "",
      insuranceExpiry: "",
      sourceNotes: "",
    },
  });
  vendorHistoryIds.push(historyId);
  await db.insert(vendorJobHistoryTable).values({
    id: historyId,
    vendorId,
    projectId,
    completedDate: "2026-02-01",
    amount: 50_000,
    source: "manual",
    recordedBy: adminId,
  });

  assert.equal((await requestAs(base, adminId, `/projects/${projectId}`, { method: "DELETE" })).status, 204);

  const [deletedProject] = await db.select({ id: importedProjectsTable.id })
    .from(importedProjectsTable)
    .where(eq(importedProjectsTable.id, projectId));
  const [remainingProject] = await db.select({ id: importedProjectsTable.id })
    .from(importedProjectsTable)
    .where(eq(importedProjectsTable.id, otherProjectId));
  const [remainingSharedVendor] = await db.select({ id: standaloneVendorProfilesTable.id })
    .from(standaloneVendorProfilesTable)
    .where(eq(standaloneVendorProfilesTable.id, vendorId));
  const [remainingHistory] = await db.select({ id: vendorJobHistoryTable.id })
    .from(vendorJobHistoryTable)
    .where(eq(vendorJobHistoryTable.id, historyId));
  const [remainingActivity] = await db.select({ id: projectActivitiesTable.id })
    .from(projectActivitiesTable)
    .where(eq(projectActivitiesTable.id, activityId));
  const [remainingImportedVendor] = await db.select({ id: importedVendorsTable.id })
    .from(importedVendorsTable)
    .where(eq(importedVendorsTable.id, importedVendorId));

  assert.equal(deletedProject, undefined);
  assert(remainingProject);
  assert(remainingSharedVendor);
  assert.equal(remainingHistory, undefined);
  assert.equal(remainingActivity, undefined);
  assert.equal(remainingImportedVendor, undefined);
});

test("permanent deletion refuses a project with an active import build", async () => {
  const adminId = `lifecycle-admin-${randomUUID()}`;
  const projectId = `lifecycle-building-${randomUUID()}`;
  const batchId = `lifecycle-building-batch-${randomUUID()}`;
  const base = await startApi(fakeClerk([makeUser(adminId, "Admin")]));
  await insertProject(projectId, batchId, adminId);
  await db.insert(projectImportBatchesTable).values({
    id: batchId,
    projectId,
    ownerId: adminId,
    workspaceId: "default",
    status: "building",
    manifest: [],
  });

  assert.equal((await requestAs(base, adminId, `/projects/${projectId}`, { method: "DELETE" })).status, 409);
  const [remainingProject] = await db.select({ id: importedProjectsTable.id })
    .from(importedProjectsTable)
    .where(eq(importedProjectsTable.id, projectId));
  assert(remainingProject);
});
