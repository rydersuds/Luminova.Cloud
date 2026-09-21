import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  importedVendorsTable,
  projectDocumentsTable,
  projectActivitiesTable,
  projectImportBatchesTable,
  projectScheduleImagesTable,
  projectScheduleMetadataTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";
import { setWorkspaceRoleResolverForTests } from "./users";

test("schedule images require project authorization and imported schedule images appear in project details", async (t) => {
  const suffix = randomUUID();
  const ownerId = `schedule-owner-${suffix}`;
  const otherOwnerId = `schedule-other-${suffix}`;
  const projectId = `schedule-project-${suffix}`;
  const importBatchId = `schedule-batch-${suffix}`;
  const otherImportBatchId = `schedule-other-batch-${suffix}`;
  const mismatchedDocumentId = `mismatched-schedule-document-${suffix}`;
  const objectPath = `/objects/uploads/${suffix}`;

  const currentDocumentId = `schedule-document-${suffix}`;
  const manualScheduleId = `manual-schedule-${suffix}`;
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
  await db.insert(projectImportBatchesTable).values({
    id: otherImportBatchId,
    projectId: `other-schedule-project-${suffix}`,
    ownerId,
    status: "completed",
    manifest: [],
  });
  await db.insert(importedProjectsTable).values({ id: projectId, importBatchId, ownerId, data: project });
  await db.insert(importedVendorsTable).values({
    id: `vendor-${suffix}`,
    importBatchId,
    ownerId,
    data: {
      id: `vendor-${suffix}`,
      companyName: "Northline Electric",
      contactName: "Jordan Lee",
      tradeType: "Electrical",
      region: "Calgary",
      rating: 0,
      reviewCount: 0,
      completedJobs: 0,
      initials: "NE",
      accent: "#c8ae4b",
      profilePhotoObjectPath: `/objects/uploads/vendor-logo-${suffix}`,
    },
  });
  await db.insert(projectDocumentsTable).values({
    id: currentDocumentId,
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
    {
      id: mismatchedDocumentId,
      importBatchId: otherImportBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/mismatched-${suffix}`,
      relativePath: "Schedules/master-schedule.png",
      name: "master-schedule.png",
      contentType: "image/png",
      size: 2048,
      classification: "schedule",
    },
  ]);
  await db.insert(projectScheduleImagesTable).values({
    id: manualScheduleId,
    projectId,
    ownerId,
    workspaceId: "default",
    objectPath: `/objects/uploads/manual-${suffix}`,
    relativePath: "manual-schedule.png",
    name: "manual-schedule.png",
    contentType: "image/png",
    size: 2048,
  });
  setWorkspaceRoleResolverForTests(async (userId) => userId === ownerId ? "Project Manager" : "Field Team");

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
  let directProjectId: string | undefined;
  let directImportBatchId: string | undefined;

  t.after(async () => {
    server.close();
    setWorkspaceRoleResolverForTests();
    await db.delete(projectActivitiesTable).where(eq(projectActivitiesTable.projectId, projectId));
    await db.delete(projectScheduleMetadataTable).where(eq(projectScheduleMetadataTable.projectId, projectId));
    await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, projectId));
    if (directProjectId) {
      await db.delete(projectScheduleImagesTable).where(eq(projectScheduleImagesTable.projectId, directProjectId));
      await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, directProjectId));
    }
    if (directImportBatchId) {
      await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, directImportBatchId));
    }
    await db.delete(importedVendorsTable).where(eq(importedVendorsTable.importBatchId, importBatchId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(and(
      inArray(projectImportBatchesTable.id, [importBatchId, otherImportBatchId]),
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
  const detail = await details.json() as { scheduleImages: Array<{
    id: string;
    name: string;
    relativePath: string;
    url: string;
    contentType: string;
    size: number;
    revision: string | null;
    effectiveDate: string | null;
    isCurrent: boolean;
  }>; trades: Array<{
    companyName: string;
    profilePhotoUrl: string | null;
    profilePhotoPositionX: number;
    profilePhotoPositionY: number;
    profilePhotoZoom: number;
  }> };

  const updateSchedule = (actor: string, imageId: string, update: {
    revision: string | null;
    effectiveDate: string | null;
    isCurrent: boolean;
  }) => fetch(`${base}/projects/${projectId}/schedule-images/${imageId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": actor },
    body: JSON.stringify(update),
  });
  assert.deepEqual(detail.scheduleImages.map((image) => ({
    id: image.id,
    revision: image.revision,
    effectiveDate: image.effectiveDate,
    isCurrent: image.isCurrent,
  })), [
    {
      id: currentDocumentId,
      revision: null,
      effectiveDate: null,
      isCurrent: false,
    },
    {
      id: manualScheduleId,
      revision: null,
      effectiveDate: null,
      isCurrent: false,
    },
  ]);
  assert.equal(detail.scheduleImages.some((image) => image.id === mismatchedDocumentId), false);
  assert.deepEqual(detail.trades.map((trade) => ({
    companyName: trade.companyName,
    profilePhotoUrl: trade.profilePhotoUrl,
    profilePhotoPositionX: trade.profilePhotoPositionX,
    profilePhotoPositionY: trade.profilePhotoPositionY,
    profilePhotoZoom: trade.profilePhotoZoom,
  })), [{
    companyName: "Northline Electric",
    profilePhotoUrl: `/api/storage/objects/uploads/vendor-logo-${suffix}`,
    profilePhotoPositionX: 50,
    profilePhotoPositionY: 50,
    profilePhotoZoom: 1,
  }]);

  const rescan = await fetch(`${base}/projects/${projectId}/vendor-quotes/rescan`, {
    method: "POST",
    headers: { "x-test-user": ownerId },
  });
  assert.equal(rescan.status, 200);
  const rescanResult = await rescan.json() as {
    documentsScanned: number;
    outcomes: Array<{ documentId: string }>;
  };
  assert.equal(rescanResult.documentsScanned, 3);
  assert.equal(rescanResult.outcomes.some((outcome) => outcome.documentId === mismatchedDocumentId), false);

  assert.equal((await updateSchedule(otherOwnerId, currentDocumentId, {
    revision: "Revision 3",
    effectiveDate: "2026-09-01",
    isCurrent: true,
  })).status, 403);
  assert.equal((await updateSchedule(ownerId, currentDocumentId, {
    revision: "Revision 3",
    effectiveDate: "2026-09-01",
    isCurrent: true,
  })).status, 200);
  assert.equal((await updateSchedule(ownerId, manualScheduleId, {
    revision: "Revision 4",
    effectiveDate: "2026-09-12",
    isCurrent: true,
  })).status, 200);

  const refreshed = await fetch(`${base}/projects/${projectId}`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(refreshed.status, 200);
  const refreshedDetail = await refreshed.json() as typeof detail;
  assert.deepEqual(refreshedDetail.scheduleImages.map((image) => ({
    id: image.id,
    revision: image.revision,
    effectiveDate: image.effectiveDate,
    isCurrent: image.isCurrent,
  })), [
    {
      id: manualScheduleId,
      revision: "Revision 4",
      effectiveDate: "2026-09-12",
      isCurrent: true,
    },
    {
      id: currentDocumentId,
      revision: "Revision 3",
      effectiveDate: "2026-09-01",
      isCurrent: false,
    },
  ]);

  const importedDeleteUrl = `${base}/projects/${projectId}/schedule-images/${currentDocumentId}`;
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
    .where(eq(projectDocumentsTable.id, currentDocumentId));
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
  assert.equal((await fetch(`${base}/projects/${projectId}/schedule-images/${mismatchedDocumentId}/restore`, {
    method: "POST",
    headers: { "x-test-user": ownerId },
  })).status, 404);
  assert.equal((await fetch(`${base}/projects/${projectId}/schedule-images/${mismatchedDocumentId}`, {
    method: "DELETE",
    headers: { "x-test-user": ownerId },
  })).status, 404);
  const [mismatchedDocument] = await db.select().from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.id, mismatchedDocumentId));
  assert.equal(mismatchedDocument.classification, "schedule");

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
    revision: null,
    effectiveDate: null,
    isCurrent: false,
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

  directProjectId = `private-schedule-project-${suffix}`;
  directImportBatchId = `private-schedule-batch-${suffix}`;
  await db.insert(projectImportBatchesTable).values({
    id: directImportBatchId,
    projectId: directProjectId,
    ownerId,
    status: "completed",
    manifest: [],
  });
  await db.insert(importedProjectsTable).values({
    id: directProjectId,
    importBatchId: directImportBatchId,
    ownerId,
    data: {
      id: directProjectId,
      name: `Private schedule project ${suffix}`,
      address: "",
      region: "Calgary",
      status: "Planning",
      progress: 0,
      projectManagerId: ownerId,
      pmName: "",
      clientName: "",
      targetDate: "",
      budgeted: 0,
      invoiced: 0,
      exteriorImage: "",
      description: "",
    },
  });
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
