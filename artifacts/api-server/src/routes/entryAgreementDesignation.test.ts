import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectDocumentsTable,
  projectImportBatchesTable,
} from "@workspace/db";

import {
  backfillLegacyEntryAgreementDesignations,
  isStandardEntryAgreementName,
} from "../lib/entryAgreement";
import luminovaRouter from "./luminova";

test("recognizes the legacy imported filename regardless of extension casing", () => {
  assert.equal(isStandardEntryAgreementName("NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf"), true);
  assert.equal(isStandardEntryAgreementName(" notice of authorized contractor & insurance access.PDF "), true);
});

test("does not designate other contract documents", () => {
  assert.equal(isStandardEntryAgreementName("Construction Management Agreement.pdf"), false);
});

test("backfills a legacy agreement and preserves its designation after it is renamed", async (t) => {
  const suffix = randomUUID();
  const ownerId = `entry-owner-${suffix}`;
  const projectId = `entry-project-${suffix}`;
  const importBatchId = `entry-batch-${suffix}`;
  const entryDocumentId = `entry-document-${suffix}`;
  const otherDocumentId = `other-contract-${suffix}`;
  const project = {
    id: projectId,
    name: "Entry agreement persistence project",
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
  await db.insert(projectDocumentsTable).values([
    {
      id: entryDocumentId,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/${entryDocumentId}`,
      relativePath: "Contracts/NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
      name: "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
      contentType: "application/pdf",
      size: 2048,
      classification: "contract",
    },
    {
      id: otherDocumentId,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/${otherDocumentId}`,
      relativePath: "Contracts/Construction Management Agreement.pdf",
      name: "Construction Management Agreement.pdf",
      contentType: "application/pdf",
      size: 2048,
      classification: "contract",
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      userId: req.header("x-test-user"),
      log: { error: () => undefined, warn: () => undefined },
    });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  t.after(async () => {
    server.close();
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(and(
      eq(projectImportBatchesTable.id, importBatchId),
      eq(projectImportBatchesTable.ownerId, ownerId),
    ));
  });

  assert.ok(await backfillLegacyEntryAgreementDesignations() >= 1);
  await db.update(projectDocumentsTable).set({
    name: "Signed site entry agreement.pdf",
    relativePath: "Contracts/Signed site entry agreement.pdf",
  }).where(eq(projectDocumentsTable.id, entryDocumentId));

  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/projects/${projectId}`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(response.status, 200);

  const detail = await response.json() as {
    files: Array<{ id: string; name: string; isEntryAgreement: boolean }>;
  };
  assert.deepEqual(
    detail.files
      .filter((file) => file.isEntryAgreement)
      .map((file) => ({ id: file.id, name: file.name })),
    [{ id: entryDocumentId, name: "Signed site entry agreement.pdf" }],
  );
  assert.equal(detail.files.find((file) => file.id === otherDocumentId)?.isEntryAgreement, false);
});