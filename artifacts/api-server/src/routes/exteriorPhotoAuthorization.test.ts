import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectDocumentsTable,
  projectExteriorPhotosTable,
  projectImportBatchesTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

test("only an imported project's owner can persist and clear its exterior photo", async (t) => {
  const suffix = randomUUID();
  const projectId = `exterior-photo-${suffix}`;
  const importBatchId = `exterior-batch-${suffix}`;
  const ownerId = `owner-${suffix}`;
  const exteriorImage = `/api/storage/objects/uploads/${suffix}`;
  const project = {
    id: projectId,
    name: "Exterior photo authorization",
    address: "",
    region: "",
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
    id: `document-${suffix}`,
    importBatchId,
    projectId,
    ownerId,
    objectPath: `/objects/uploads/${suffix}`,
    relativePath: "Photos/front.jpg",
    name: "front.jpg",
    contentType: "image/jpeg",
    size: 100,
    classification: "photo",
    visualCaption: "Front elevation with installed windows and unfinished cladding.",
    visualTags: ["front elevation", "windows", "unfinished cladding", "exterior"],
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user");
    if (actor) Object.assign(req, { userId: actor });
    Object.assign(req, { log: { error: () => undefined } });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const update = (actor?: string) => fetch(`http://127.0.0.1:${port}/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(actor ? { "x-test-user": actor } : {}),
    },
    body: JSON.stringify({ exteriorImage }),
  });

  t.after(async () => {
    server.close();
    await db.delete(projectExteriorPhotosTable).where(eq(projectExteriorPhotosTable.projectId, projectId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, importBatchId));
  });

  assert.equal((await update()).status, 401);
  assert.equal((await update(`other-${suffix}`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/projects/${projectId}`, {
    headers: { "x-test-user": `other-${suffix}` },
  })).status, 404);
  assert.equal((await update(ownerId)).status, 200);

  const [saved] = await db.select().from(projectExteriorPhotosTable).where(and(
    eq(projectExteriorPhotosTable.projectId, projectId),
    eq(projectExteriorPhotosTable.ownerId, ownerId),
  ));
  assert.equal(saved?.exteriorImage, exteriorImage);

  const refreshed = await fetch(`http://127.0.0.1:${port}/projects/${projectId}`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(refreshed.status, 200);
  const refreshedProject = await refreshed.json() as {
    exteriorImage: string;
    photos: Array<{ url: string; visualCaption: string; visualTags: string[] }>;
  };
  assert.equal(refreshedProject.exteriorImage, exteriorImage);
  assert.deepEqual(refreshedProject.photos[0], {
    url: exteriorImage,
    visualCaption: "Front elevation with installed windows and unfinished cladding.",
    visualTags: ["front elevation", "windows", "unfinished cladding", "exterior"],
    id: `document-${suffix}`,
    caption: "Photos/front.jpg",
    phase: "Photos",
    date: "",
  });

  const cleared = await fetch(`http://127.0.0.1:${port}/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-test-user": ownerId,
    },
    body: JSON.stringify({ exteriorImage: null }),
  });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json() as { exteriorImage: string }).exteriorImage, "");

  const refreshedAfterClear = await fetch(`http://127.0.0.1:${port}/projects/${projectId}`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(refreshedAfterClear.status, 200);
  assert.equal((await refreshedAfterClear.json() as { exteriorImage: string }).exteriorImage, "");

  const [savedClear] = await db.select().from(projectExteriorPhotosTable).where(and(
    eq(projectExteriorPhotosTable.projectId, projectId),
    eq(projectExteriorPhotosTable.ownerId, ownerId),
  ));
  assert.equal(savedClear?.exteriorImage, "");
});
