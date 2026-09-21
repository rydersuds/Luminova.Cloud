import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { File } from "@google-cloud/storage";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  importedProjectsTable,
  projectActivitiesTable,
  projectDocumentsTable,
  projectImportBatchesTable,
} from "@workspace/db";

import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  backfillLegacyEntryAgreementDesignations,
  isStandardEntryAgreementName,
  selectEntryAgreementRelativePath,
} from "../lib/entryAgreement";
import luminovaRouter from "./luminova";

test("recognizes the legacy imported filename regardless of extension casing", () => {
  assert.equal(
    isStandardEntryAgreementName(
      "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
    ),
    true,
  );
  assert.equal(
    isStandardEntryAgreementName(
      " notice of authorized contractor & insurance access.PDF ",
    ),
    true,
  );
});

test("does not designate other contract documents", () => {
  assert.equal(
    isStandardEntryAgreementName("Construction Management Agreement.pdf"),
    false,
  );
});

test("selects the standard agreement from the current import paths", () => {
  assert.equal(
    selectEntryAgreementRelativePath([
      {
        relativePath: "Contracts/Construction Management Agreement.pdf",
        name: "Construction Management Agreement.pdf",
        textSnippet: "Agreement for construction management services.",
      },
      {
        relativePath:
          "Site/NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.PDF",
        name: "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.PDF",
      },
    ]),
    "Site/NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.PDF",
  );
});

test("selects equivalent site-access wording supported by extracted text", () => {
  assert.equal(
    selectEntryAgreementRelativePath([
      {
        relativePath: "Administration/owner-form.pdf",
        name: "owner-form.pdf",
        textSnippet:
          "Site access authorization and agreement. Contractor must provide proof of insurance before entry to the property.",
      },
    ]),
    "Administration/owner-form.pdf",
  );
});

test("keeps the entry agreement empty when no confident match exists", () => {
  assert.equal(
    selectEntryAgreementRelativePath([
      {
        relativePath: "Contracts/Prime Contract.pdf",
        name: "Prime Contract.pdf",
        textSnippet: "Construction services agreement and payment terms.",
      },
      {
        relativePath: "Schedules/Master Schedule.pdf",
        name: "Master Schedule.pdf",
        textSnippet: "Foundation and framing milestones.",
      },
    ]),
    null,
  );
});

test("rejects equally confident candidates instead of designating an arbitrary agreement", () => {
  assert.equal(
    selectEntryAgreementRelativePath([
      {
        relativePath: "Copy A/Site access agreement.pdf",
        name: "Site access agreement.pdf",
      },
      {
        relativePath: "Copy B/Site access agreement.pdf",
        name: "Site access agreement.pdf",
      },
    ]),
    null,
  );
});

test("only considers candidates explicitly supplied from the current import", () => {
  const otherProjectDocument = {
    relativePath:
      "Other project/NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
    name: "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
  };
  const currentImport = [
    {
      relativePath: "Current project/Construction Management Agreement.pdf",
      name: "Construction Management Agreement.pdf",
      textSnippet: "Construction management services.",
    },
  ];

  assert.equal(selectEntryAgreementRelativePath(currentImport), null);
  assert.equal(
    selectEntryAgreementRelativePath([...currentImport, otherProjectDocument]),
    otherProjectDocument.relativePath,
  );
});

test("authorizes direct entry-agreement uploads and retains replaced contract records", async (t) => {
  const suffix = randomUUID();
  const ownerId = `direct-entry-owner-${suffix}`;
  const otherUserId = `direct-entry-other-${suffix}`;
  const projectId = `direct-entry-project-${suffix}`;
  const importBatchId = `direct-entry-batch-${suffix}`;
  const priorAgreementId = `prior-entry-agreement-${suffix}`;
  const priorContractId = `prior-contract-${suffix}`;
  const project = {
    id: projectId,
    name: "Direct entry agreement authorization project",
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
  await db.insert(importedProjectsTable).values({
    id: projectId,
    importBatchId,
    ownerId,
    data: project,
  });
  await db.insert(projectDocumentsTable).values([
    {
      id: priorAgreementId,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/${priorAgreementId}`,
      relativePath: "Contracts/prior-entry-agreement.pdf",
      name: "prior-entry-agreement.pdf",
      contentType: "application/pdf",
      size: 2048,
      classification: "contract",
      isEntryAgreement: true,
    },
    {
      id: priorContractId,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/${priorContractId}`,
      relativePath: "Contracts/other-contract.pdf",
      name: "other-contract.pdf",
      contentType: "application/pdf",
      size: 1024,
      classification: "contract",
    },
  ]);

  const originalGetObjectEntityFile = ObjectStorageService.prototype.getObjectEntityFile;
  let verificationCalls = 0;
  ObjectStorageService.prototype.getObjectEntityFile = async function (): Promise<File> {
    verificationCalls += 1;
    return {
      getMetadata: async () => [{ size: "2048", contentType: "application/pdf" }],
    } as unknown as File;
  };

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
  const { port } = server.address() as AddressInfo;
  const body = {
    objectPath: `/objects/uploads/new-entry-agreement-${suffix}`,
    name: "new-entry-agreement.pdf",
    size: 2048,
    contentType: "application/pdf",
  };

  t.after(async () => {
    ObjectStorageService.prototype.getObjectEntityFile = originalGetObjectEntityFile;
    server.close();
    await db.delete(projectActivitiesTable).where(eq(projectActivitiesTable.projectId, projectId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, importBatchId));
  });

  const upload = (actor: string) => fetch(
    `http://127.0.0.1:${port}/projects/${projectId}/entry-agreement`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user": actor,
      },
      body: JSON.stringify(body),
    },
  );

  assert.equal((await upload(otherUserId)).status, 404);
  assert.equal(verificationCalls, 0);

  const response = await upload(ownerId);
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const created = JSON.parse(responseText) as {
    id: string;
    isEntryAgreement: boolean;
    classification: string;
  };
  assert.equal(created.isEntryAgreement, true);
  assert.equal(created.classification, "contract");
  assert.equal(verificationCalls, 1);

  const documents = await db.select({
    id: projectDocumentsTable.id,
    name: projectDocumentsTable.name,
    isEntryAgreement: projectDocumentsTable.isEntryAgreement,
    classification: projectDocumentsTable.classification,
  }).from(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
  assert.equal(documents.length, 3);
  const designationById = documents
    .map(({ id, isEntryAgreement }) => ({ id, isEntryAgreement }))
    .sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(
    designationById,
    [
      { id: priorAgreementId, isEntryAgreement: false },
      { id: priorContractId, isEntryAgreement: false },
      { id: created.id, isEntryAgreement: true },
    ].sort((left, right) => left.id.localeCompare(right.id)),
  );
  assert.equal(
    documents.find((document) => document.id === priorAgreementId)?.classification,
    "contract",
  );
});

test("rejects direct entry-agreement uploads when the private object is missing or its metadata mismatches", async (t) => {
  const suffix = randomUUID();
  const ownerId = `direct-entry-metadata-owner-${suffix}`;
  const projectId = `direct-entry-metadata-project-${suffix}`;
  const importBatchId = `direct-entry-metadata-batch-${suffix}`;
  const project = {
    id: projectId,
    name: "Direct entry agreement metadata project",
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
  await db.insert(importedProjectsTable).values({
    id: projectId,
    importBatchId,
    ownerId,
    data: project,
  });

  const originalGetObjectEntityFile = ObjectStorageService.prototype.getObjectEntityFile;
  ObjectStorageService.prototype.getObjectEntityFile = async function (): Promise<File> {
    throw new ObjectNotFoundError();
  };

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
  const { port } = server.address() as AddressInfo;
  const request = (body: {
    objectPath: string;
    name: string;
    size: number;
    contentType: string;
  }) => fetch(
    `http://127.0.0.1:${port}/projects/${projectId}/entry-agreement`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user": ownerId,
      },
      body: JSON.stringify(body),
    },
  );

  t.after(async () => {
    ObjectStorageService.prototype.getObjectEntityFile = originalGetObjectEntityFile;
    server.close();
    await db.delete(projectActivitiesTable).where(eq(projectActivitiesTable.projectId, projectId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, importBatchId));
  });

  const baseBody = {
    objectPath: `/objects/uploads/metadata-entry-agreement-${suffix}`,
    name: "metadata-entry-agreement.pdf",
    size: 2048,
    contentType: "application/pdf",
  };
  const missing = await request(baseBody);
  assert.equal(missing.status, 422);

  ObjectStorageService.prototype.getObjectEntityFile = async function (): Promise<File> {
    return {
      getMetadata: async () => [{ size: "2048", contentType: "application/pdf" }],
    } as unknown as File;
  };
  const mismatched = await request({ ...baseBody, size: 4096 });
  assert.equal(mismatched.status, 422);

  const documents = await db.select().from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.projectId, projectId));
  assert.deepEqual(documents, []);
});

test("backfills a legacy agreement and preserves its designation after it is renamed", async (t) => {
  const suffix = randomUUID();
  const ownerId = `entry-owner-${suffix}`;
  const projectId = `entry-project-${suffix}`;
  const importBatchId = `entry-batch-${suffix}`;
  const entryDocumentId = `entry-document-${suffix}`;
  const otherDocumentId = `other-contract-${suffix}`;
  const otherProjectId = `other-entry-project-${suffix}`;
  const otherImportBatchId = `other-entry-batch-${suffix}`;
  const otherProjectDocumentId = `other-entry-document-${suffix}`;
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
  await db.insert(projectImportBatchesTable).values({
    id: otherImportBatchId,
    projectId: otherProjectId,
    ownerId,
    status: "completed",
    manifest: [],
  });
  await db.insert(importedProjectsTable).values([
    { id: projectId, importBatchId, ownerId, data: project },
    {
      id: otherProjectId,
      importBatchId: otherImportBatchId,
      ownerId,
      data: {
        ...project,
        id: otherProjectId,
        name: "Other entry agreement project",
      },
    },
  ]);
  await db.insert(projectDocumentsTable).values([
    {
      id: entryDocumentId,
      importBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/uploads/${entryDocumentId}`,
      relativePath:
        "Contracts/NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
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
    {
      id: otherProjectDocumentId,
      importBatchId: otherImportBatchId,
      projectId: otherProjectId,
      ownerId,
      objectPath: `/objects/uploads/${otherProjectDocumentId}`,
      relativePath:
        "Contracts/NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
      name: "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf",
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
    await db
      .delete(projectDocumentsTable)
      .where(
        inArray(projectDocumentsTable.projectId, [projectId, otherProjectId]),
      );
    await db
      .delete(importedProjectsTable)
      .where(inArray(importedProjectsTable.id, [projectId, otherProjectId]));
    await db
      .delete(projectImportBatchesTable)
      .where(
        and(
          inArray(projectImportBatchesTable.id, [
            importBatchId,
            otherImportBatchId,
          ]),
          eq(projectImportBatchesTable.ownerId, ownerId),
        ),
      );
  });

  assert.ok((await backfillLegacyEntryAgreementDesignations()) >= 1);
  await db
    .update(projectDocumentsTable)
    .set({
      name: "Signed site entry agreement.pdf",
      relativePath: "Contracts/Signed site entry agreement.pdf",
    })
    .where(eq(projectDocumentsTable.id, entryDocumentId));

  const response = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/projects/${projectId}`,
    {
      headers: { "x-test-user": ownerId },
    },
  );
  assert.equal(response.status, 200);

  const detail = (await response.json()) as {
    files: Array<{ id: string; name: string; isEntryAgreement: boolean }>;
  };
  assert.deepEqual(
    detail.files
      .filter((file) => file.isEntryAgreement)
      .map((file) => ({ id: file.id, name: file.name })),
    [{ id: entryDocumentId, name: "Signed site entry agreement.pdf" }],
  );
  assert.equal(
    detail.files.find((file) => file.id === otherDocumentId)?.isEntryAgreement,
    false,
  );
  assert.equal(
    detail.files.some((file) => file.id === otherProjectDocumentId),
    false,
  );
});
