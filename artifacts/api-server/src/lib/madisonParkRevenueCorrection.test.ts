import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  importedInvoicesTable,
  importedProjectsTable,
  projectDocumentsTable,
  projectImportBatchesTable,
} from "@workspace/db";
import {
  applyMadisonParkRevenueCorrection,
  findMadisonParkRevenueSource,
  MADISON_PARK_REVENUE_CORRECTION_KEY,
  MADISON_PARK_REVENUE_AMOUNT,
} from "./madisonParkRevenueCorrection";
import luminovaRouter from "../routes/luminova";

const sourceText = `
  MADISON PARK – REBUILD PROPOSAL
  Prepared for Weidner Investment Services, Inc.
  By Luminova Construction
  DATED: May 29, 2026
  REVISED June 18, 2026 – Removed Tile Surrounds
  Project address: 79 Cambridge Ave, Regina, SK
  GRAND TOTAL INCLUDING ALL APPLICABLE TAXES $942,715.84
`;

test("matches the client proposal by scope, content, parties, and exact total", () => {
  const exactDocument = {
    id: "source",
    projectId: "project",
    ownerId: "owner",
    relativePath: "Building 79/Rebuild Quote/Weidner - 79 Cambridge Ave Madison Park RebuildREV1- Incl Taxes.pdf",
    name: "Weidner - 79 Cambridge Ave Madison Park RebuildREV1- Incl Taxes.pdf",
    objectPath: "/objects/source",
    contentType: "application/pdf",
    size: 1,
    classification: "quote",
    textSnippet: sourceText,
  };
  const source = findMadisonParkRevenueSource([
    {
      id: "decoy",
      projectId: "project",
      ownerId: "owner",
      relativePath: "Building 79/Rebuild Quote/Weidner Madison Park proposal.pdf",
      name: "Weidner Madison Park proposal.pdf",
      objectPath: "/objects/decoy",
      contentType: "application/pdf",
      size: 1,
      classification: "quote",
      textSnippet: "",
    },
    exactDocument,
  ]);

  assert.deepEqual(source, {
    documentId: "source",
    sourcePath: "Building 79/Rebuild Quote/Weidner - 79 Cambridge Ave Madison Park RebuildREV1- Incl Taxes.pdf",
    amount: MADISON_PARK_REVENUE_AMOUNT,
    date: "2026-06-18",
    issuer: "Luminova Construction",
    recipient: "Weidner Investment Services, Inc.",
    evidence: "GRAND TOTAL INCLUDING ALL APPLICABLE TAXES $942,715.84",
  });
  assert.equal(findMadisonParkRevenueSource([{
    ...exactDocument,
    textSnippet: sourceText.replace("$942,715.84", "$900,000.00"),
  }]), null);
  assert.equal(findMadisonParkRevenueSource([{
    ...exactDocument,
    textSnippet: sourceText.replace("REVISED June 18, 2026", "REVISED June 17, 2026"),
  }]), null);
  assert.equal(findMadisonParkRevenueSource([{
    ...exactDocument,
    textSnippet: sourceText.replace(
      "DATED: May 29, 2026\n  REVISED June 18, 2026",
      "DATED: June 18, 2026",
    ),
  }]), null);
});

test("corrects the first project response once, scopes it to the owner, and preserves internal costs", async (t) => {
  const suffix = randomUUID();
  const ownerId = `madison-owner-${suffix}`;
  const otherOwnerId = `madison-other-${suffix}`;
  const projectId = `madison-project-${suffix}`;
  const otherProjectId = `madison-other-project-${suffix}`;
  const batchId = `madison-batch-${suffix}`;
  const otherBatchId = `madison-other-batch-${suffix}`;
  const documentId = `madison-source-${suffix}`;
  const otherDocumentId = `madison-other-source-${suffix}`;
  const project = {
    id: projectId,
    name: "Madison Park Building 79",
    address: "79 Cambridge Ave, Regina, SK",
    region: "Regina",
    status: "Planning",
    progress: 47.3,
    pmName: "Test PM",
    clientName: "Weidner Investment Services, Inc.",
    targetDate: "2026-12-31",
    budgeted: 1200000,
    invoiced: 446070.71,
    exteriorImage: "",
    description: "Madison Park test project",
    clientQuote: { total: MADISON_PARK_REVENUE_AMOUNT, revision: "Revised June 18, 2026", portions: [] },
    budgetLineItems: [{
      id: "ACT-01",
      code: "ACT-01",
      description: "Abatement & demolition — committed internal cost",
      budgeted: 0,
      invoiced: 196801.5,
      variance: -196801.5,
    }],
  };
  const otherProject = { ...project, id: otherProjectId, name: "Madison Park Building 79", invoiced: 100 };

  await db.insert(projectImportBatchesTable).values([
    { id: batchId, projectId, ownerId, status: "completed", manifest: [] },
    { id: otherBatchId, projectId: otherProjectId, ownerId: otherOwnerId, status: "completed", manifest: [] },
  ]);
  await db.insert(importedProjectsTable).values([
    { id: projectId, importBatchId: batchId, ownerId, data: project },
    { id: otherProjectId, importBatchId: otherBatchId, ownerId: otherOwnerId, data: otherProject },
  ]);
  await db.insert(importedInvoicesTable).values({
    id: `madison-existing-invoice-${suffix}`,
    importBatchId: batchId,
    ownerId,
    data: {
      id: `madison-existing-invoice-${suffix}`,
      invoiceNumber: "MADISON-EXISTING-REVENUE",
      projectId,
      projectName: project.name,
      vendor: project.clientName,
      amount: 446070.71,
      date: "2026-05-29",
      status: "Paid",
      lineItem: "Existing imported client invoices",
      overage: 0,
    },
  });
  await db.insert(projectDocumentsTable).values([
    {
      id: documentId,
      importBatchId: batchId,
      projectId,
      ownerId,
      objectPath: `/objects/${documentId}`,
      relativePath: "Building 79/Rebuild Quote/client-proposal.pdf",
      name: "client-proposal.pdf",
      contentType: "application/pdf",
      size: sourceText.length,
      classification: "quote",
      textSnippet: sourceText,
    },
    {
      id: otherDocumentId,
      importBatchId: otherBatchId,
      projectId: otherProjectId,
      ownerId: otherOwnerId,
      objectPath: `/objects/${otherDocumentId}`,
      relativePath: "Building 79/Rebuild Quote/client-proposal.pdf",
      name: "client-proposal.pdf",
      contentType: "application/pdf",
      size: sourceText.length,
      classification: "quote",
      textSnippet: sourceText,
    },
  ]);
  t.after(async () => {
    await db.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, [batchId, otherBatchId]));
    await db.delete(projectDocumentsTable).where(inArray(projectDocumentsTable.importBatchId, [batchId, otherBatchId]));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.importBatchId, [batchId, otherBatchId]));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, [batchId, otherBatchId]));
  });

  await assert.rejects(
    applyMadisonParkRevenueCorrection(ownerId, undefined, {
      beforeProjectUpdate: () => {
        throw new Error("injected project update failure");
      },
    }),
    /injected project update failure/,
  );
  const invoicesAfterRollback = await db.select({ data: importedInvoicesTable.data })
    .from(importedInvoicesTable)
    .where(and(eq(importedInvoicesTable.ownerId, ownerId), eq(importedInvoicesTable.importBatchId, batchId)));
  assert.equal(invoicesAfterRollback.length, 1);
  const [projectAfterRollback] = await db.select({ data: importedProjectsTable.data })
    .from(importedProjectsTable)
    .where(and(eq(importedProjectsTable.id, projectId), eq(importedProjectsTable.ownerId, ownerId)));
  assert.equal((projectAfterRollback!.data as typeof project).invoiced, 446070.71);
  assert.equal("revenueAdjustments" in (projectAfterRollback!.data as object), false);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      userId: ownerId,
      log: { error: () => undefined, warn: () => undefined },
    });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const firstResponse = await fetch(`http://127.0.0.1:${port}/projects/${projectId}`);
  assert.equal(firstResponse.status, 200);
  const firstProject = await firstResponse.json() as {
    invoiced: number;
    progress: number;
    invoices: Array<{ amount: number; direction?: string; invoiceNumber: string }>;
  };
  assert.equal(firstProject.invoiced, 1388786.55);
  assert.equal(firstProject.progress, 100);
  assert.deepEqual(
    firstProject.invoices
      .filter((invoice) => invoice.invoiceNumber === "MADISON-PARK-REV-2026-06-18")
      .map((invoice) => ({ amount: invoice.amount, direction: invoice.direction })),
    [{ amount: MADISON_PARK_REVENUE_AMOUNT, direction: "luminova_to_client" }],
  );

  const second = await applyMadisonParkRevenueCorrection(ownerId);
  assert.equal(second.applied, false);
  assert.equal(second.alreadyApplied, true);
  assert.equal(await applyMadisonParkRevenueCorrection(otherOwnerId).then((result) => result.applied), true);

  const [savedProject] = await db.select({ data: importedProjectsTable.data })
    .from(importedProjectsTable)
    .where(and(eq(importedProjectsTable.id, projectId), eq(importedProjectsTable.ownerId, ownerId)));
  const saved = savedProject!.data as typeof project & { revenueAdjustments: Array<{ key: string }> };
  assert.equal(saved.invoiced, 1388786.55);
  assert.equal(saved.budgetLineItems[0].invoiced, 196801.5);
  assert.deepEqual(saved.revenueAdjustments, [{
    key: MADISON_PARK_REVENUE_CORRECTION_KEY,
    amount: MADISON_PARK_REVENUE_AMOUNT,
    sourceDocumentId: documentId,
    sourcePath: "Building 79/Rebuild Quote/client-proposal.pdf",
  }]);

  const savedInvoices = await db.select({ data: importedInvoicesTable.data })
    .from(importedInvoicesTable)
    .where(and(eq(importedInvoicesTable.ownerId, ownerId), eq(importedInvoicesTable.importBatchId, batchId)));
  assert.equal(savedInvoices.length, 2);
  const correctionInvoice = savedInvoices
    .map((row) => row.data as { direction?: string; sourceDocumentId?: string; amount: number })
    .find((invoice) => invoice.sourceDocumentId === documentId);
  assert.equal(correctionInvoice?.direction, "luminova_to_client");
  assert.equal(correctionInvoice?.sourceDocumentId, documentId);
  assert.equal(correctionInvoice?.amount, MADISON_PARK_REVENUE_AMOUNT);

  const otherInvoices = await db.select({ data: importedInvoicesTable.data })
    .from(importedInvoicesTable)
    .where(and(eq(importedInvoicesTable.ownerId, otherOwnerId), eq(importedInvoicesTable.importBatchId, otherBatchId)));
  assert.equal(otherInvoices.length, 1);
});
