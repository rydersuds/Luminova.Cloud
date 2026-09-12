import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import type { ClerkClient } from "@clerk/backend";
import { and, eq } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectDocumentsTable,
  projectActivitiesTable,
  projectImportBatchesTable,
  projectScheduleImagesTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

test("schedule images require project authorization and imported schedule images appear in project details", async (t) => {
  const suffix = randomUUID();
  const ownerId = `schedule-owner-${suffix}`;
  const otherOwnerId = `schedule-other-${suffix}`;
  const managerId = `schedule-manager-${suffix}`;
  const projectId = `schedule-project-${suffix}`;
  const importBatchId = `schedule-batch-${suffix}`;
  const objectPath = `/objects/uploads/${suffix}`;
  const project = {
    id: projectId,
    name: "Schedule authorization project",
    address: "",
    region: "Calgary",
    status: "Planning",
    progress: 0,
    pmName: "",
    clientName: "",
    targetDate: "",
    budgeted: 0,
    invoiced: 0,
    exteriorImage: "",
    description: "",
  };

  await db.insert(projectImportBatchesTable).values({
    id: importBatchId,
    projectId,
    ownerId,
    status: "completed",
    manifest: [],
  });
  await db.insert(importedProjectsTable).values({ id: projectId, importBatchId, ownerId, data: project });
  await db.insert(projectDocumentsTable).values({
    id: `schedule-document-${suffix}`,
    importBatchId,
    projectId,
    ownerId,
    objectPath,
    relativePath: "Schedules/master-schedule.png",
    name: "master-schedule.png",
    contentType: "image/png",
    size: 2048,
    classification: "schedule",
  });
  await db.insert(projectDocumentsTable).values([
    {
      id: `restorable-document-${suffix}`,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/restorable-${suffix}`,
      relativePath: "Archive/removed-schedule.webp",
      name: "removed-schedule.webp",
      contentType: "image/webp",
      size: 1024,
      classification: "other",
    },
    {
      id: `non-image-document-${suffix}`,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/non-image-${suffix}`,
      relativePath: "Archive/notes.pdf",
      name: "notes.pdf",
      contentType: "application/pdf",
      size: 1024,
      classification: "other",
    },
  ]);
  await db.insert(projectScheduleImagesTable).values({
    id: `manual-schedule-${suffix}`,
    projectId,
    ownerId,
    workspaceId: "default",
    objectPath: `/objects/uploads/manual-${suffix}`,
    relativePath: "manual-schedule.png",
    name: "manual-schedule.png",
    contentType: "image/png",
    size: 2048,
  });

  const app = express();
  app.locals.projectAssignmentClerkClient = {
    users: {
      getUser: async (userId: string) => ({
        id: userId,
        firstName: userId === ownerId ? "Admin" : "Project",
        lastName: userId === ownerId ? "Owner" : "Manager",
        fullName: userId === ownerId ? "Admin Owner" : "Project Manager",
        username: null,
        primaryEmailAddress: { emailAddress: `${userId}@example.com` },
        publicMetadata: { role: userId === ownerId ? "Admin" : "Project Manager" },
      }),
    },
  } as unknown as ClerkClient;
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user");
    if (actor) Object.assign(req, { userId: actor });
    Object.assign(req, { log: { error: () => undefined, warn: () => undefined } });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = {
    objectPath: "/objects/uploads/new-schedule",
    name: "new-schedule.png",
    size: 2048,
    contentType: "image/png",
  };
  let directProjectId: string | undefined;
  let directImportBatchId: string | undefined;

  t.after(async () => {
    server.close();
    await db.delete(projectActivitiesTable).where(eq(projectActivitiesTable.projectId, projectId));
    await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, projectId));
    if (directProjectId) {
      await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, directProjectId));
      await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, directProjectId));
    }
    if (directImportBatchId) {
      await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, directImportBatchId));
    }
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(and(
      eq(projectImportBatchesTable.id, importBatchId),
      eq(projectImportBatchesTable.ownerId, ownerId),
    ));
  });

  const request = (actor: string | undefined, init: RequestInit = {}) => fetch(`${base}/projects/${projectId}/schedule-images`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(actor ? { "x-test-user": actor } : {}),
      ...init.headers,
    },
  });

  assert.equal((await request(undefined, { method: "POST", body: JSON.stringify(body) })).status, 401);
  assert.equal((await request(otherOwnerId, { method: "POST", body: JSON.stringify(body) })).status, 404);

  const details = await fetch(`${base}/projects/${projectId}`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(details.status, 200);
  const detail = await details.json() as { scheduleImages: Array<{ name: string; relativePath: string; url: string }> };
  assert.deepEqual(detail.scheduleImages, [
    {
      id: `schedule-document-${suffix}`,
      name: "master-schedule.png",
      relativePath: "Schedules/master-schedule.png",
      url: `/api/storage${objectPath}`,
      contentType: "image/png",
      size: 2048,
    },
    {
      id: `manual-schedule-${suffix}`,
      name: "manual-schedule.png",
      relativePath: "manual-schedule.png",
      url: `/api/storage/objects/uploads/manual-${suffix}`,
      contentType: "image/png",
      size: 2048,
    },
  ]);

  assert.equal((await fetch(`${base}/projects/${projectId}`, {
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);

  const importedDeleteUrl = `${base}/projects/${projectId}/schedule-images/schedule-document-${suffix}`;
  assert.equal((await fetch(importedDeleteUrl, { method: "DELETE" })).status, 401);
  assert.equal((await fetch(importedDeleteUrl, {
    method: "DELETE",
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);
  assert.equal((await fetch(importedDeleteUrl, {
    method: "DELETE",
    headers: { "x-test-user": ownerId },
  })).status, 204);

  const [sourceDocument] = await db.select().from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.id, `schedule-document-${suffix}`));
  assert.equal(sourceDocument.classification, "other");
  assert.equal(sourceDocument.objectPath, objectPath);

  const restoreUrl = `${base}/projects/${projectId}/schedule-images/restorable-document-${suffix}/restore`;
  assert.equal((await fetch(restoreUrl, { method: "POST" })).status, 401);
  assert.equal((await fetch(restoreUrl, {
    method: "POST",
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);
  assert.equal((await fetch(`${base}/projects/${projectId}/schedule-images/non-image-document-${suffix}/restore`, {
    method: "POST",
    headers: { "x-test-user": ownerId },
  })).status, 404);

  assert.equal((await fetch(`${base}/projects/${projectId}/activity`)).status, 401);
  assert.equal((await fetch(`${base}/projects/${projectId}/activity`, {
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);
  const activityBeforeRestore = await fetch(`${base}/projects/${projectId}/activity`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(activityBeforeRestore.status, 200);
  assert.deepEqual(await activityBeforeRestore.json(), []);

  const restored = await fetch(restoreUrl, {
    method: "POST",
    headers: { "x-test-user": ownerId },
  });
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), {
    id: `restorable-document-${suffix}`,
    name: "removed-schedule.webp",
    relativePath: "Archive/removed-schedule.webp",
    url: `/api/storage/objects/uploads/restorable-${suffix}`,
    contentType: "image/webp",
    size: 1024,
  });
  const [restoredDocument] = await db.select().from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.id, `restorable-document-${suffix}`));
  assert.equal(restoredDocument.classification, "schedule");

  const activityAfterRestore = await fetch(`${base}/projects/${projectId}/activity`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(activityAfterRestore.status, 200);
  const restoredActivity = await activityAfterRestore.json() as Array<{
    type: string;
    title: string;
    description: string;
    author: string;
    date: string;
  }>;
  assert.equal(restoredActivity.length, 1);
  assert.equal(restoredActivity[0]?.type, "schedule");
  assert.equal(restoredActivity[0]?.title, "Schedule image restored");
  assert.match(restoredActivity[0]?.description ?? "", /removed-schedule\.webp/);
  assert.equal(restoredActivity[0]?.author, ownerId);
  assert.equal(Number.isNaN(Date.parse(restoredActivity[0]?.date ?? "")), false);

  const createDirectProject = await fetch(`${base}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": ownerId },
    body: JSON.stringify({
      name: `Private schedule project ${suffix}`,
      address: "",
      region: "Calgary",
      status: "Planning",
      projectManagerId: managerId,
      clientName: "",
      targetDate: "",
      budgeted: 0,
      description: "",
    }),
  });
  assert.equal(createDirectProject.status, 201);
  directProjectId = (await createDirectProject.json() as { id: string }).id;
  const [directProjectRow] = await db.select({ importBatchId: importedProjectsTable.importBatchId })
    .from(importedProjectsTable)
    .where(eq(importedProjectsTable.id, directProjectId));
  assert(directProjectRow);
  directImportBatchId = directProjectRow.importBatchId;
  const directImageId = `direct-schedule-${suffix}`;
  await db.insert(projectScheduleImagesTable).values({
    id: directImageId,
    projectId: directProjectId,
    ownerId,
    workspaceId: "default",
    objectPath: `/objects/uploads/direct-${suffix}`,
    relativePath: "private-schedule.png",
    name: "private-schedule.png",
    contentType: "image/png",
    size: 2048,
  });

  assert.equal((await fetch(`${base}/projects/${directProjectId}/schedule-images`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": otherOwnerId },
    body: JSON.stringify(body),
  })).status, 404);
  assert.equal((await fetch(`${base}/projects/${directProjectId}/schedule-images/${directImageId}`, {
    method: "DELETE",
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);
  const [protectedDirectImage] = await db.select({ id: projectScheduleImagesTable.id })
    .from(projectScheduleImagesTable)
    .where(eq(projectScheduleImagesTable.id, directImageId));
  assert.equal(protectedDirectImage.id, directImageId);
});