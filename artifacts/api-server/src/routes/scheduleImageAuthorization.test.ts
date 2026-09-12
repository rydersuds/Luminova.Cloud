import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectDocumentsTable,
  projectImportBatchesTable,
  projectScheduleImagesTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

test("schedule images require project authorization and imported schedule images appear in project details", async (t) => {
  const suffix = randomUUID();
  const ownerId = `schedule-owner-${suffix}`;
  const otherOwnerId = `schedule-other-${suffix}`;
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

  const app = express();
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

  t.after(async () => {
    server.close();
    await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, projectId));
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
  assert.deepEqual(detail.scheduleImages, [{
    id: `schedule-document-${suffix}`,
    name: "master-schedule.png",
    relativePath: "Schedules/master-schedule.png",
    url: `/api/storage${objectPath}`,
    contentType: "image/png",
    size: 2048,
  }]);

  assert.equal((await fetch(`${base}/projects/${projectId}`, {
    headers: { "x-test-user": otherOwnerId },
  })).status, 404);
});