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
  importedVendorQuotesTable,
  projectDocumentsTable,
  projectImportBatchesTable,
} from "@workspace/db";
import {
  applyMadisonParkRevenueCorrection,
  findMadisonParkRevenueSource,
  MADISON_PARK_REVENUE_CORRECTION_KEY,
  MADISON_PARK_REVENUE_AMOUNT,
  MADISON_PARK_CLIENT_QUOTE_TOTAL,
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
  const mismatchedBatchId = `madison-mismatched-batch-${suffix}`;
  const documentId = `madison-source-${suffix}`;
  const otherDocumentId = `madison-other-source-${suffix}`;
  const mismatchedDocumentId = `madison-mismatched-source-${suffix}`;
  const project = {
    id: projectId,
    name: "Madison Park Building 79",
    address: "79 Cambridge Ave, Regina, SK",
    region: "Regina",
    status: "Planning",
    progress: 100,
    pmName: "Test PM",
    clientName: "Weidner Investment Services, Inc.",
    targetDate: "2026-12-31",
    budgeted: 1200000,
    invoiced: 1388786.55,
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
    revenueAdjustments: [{
      key: "madison-park-rebuild-revenue-2026-06-18",
      amount: MADISON_PARK_REVENUE_AMOUNT,
      sourceDocumentId: "legacy-correction-document",
      sourcePath: "legacy-correction.pdf",
    }, {
      key: "unrelated-adjustment",
      amount: 25,
      sourceDocumentId: "unrelated-document",
      sourcePath: "unrelated.pdf",
    }],
  };
  const otherProject = { ...project, id: otherProjectId, name: "Madison Park Building 79", invoiced: 100 };

  await db.insert(projectImportBatchesTable).values([
    { id: batchId, projectId, ownerId, status: "completed", manifest: [] },
    { id: otherBatchId, projectId: otherProjectId, ownerId: otherOwnerId, status: "completed", manifest: [] },
    { id: mismatchedBatchId, projectId, ownerId, status: "completed", manifest: [] },
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
        direction: "luminova_to_client",
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
    {
      id: mismatchedDocumentId,
      importBatchId: mismatchedBatchId,
      projectId,
      ownerId,
      objectPath: `/objects/${mismatchedDocumentId}`,
      relativePath: "Building 79/Rebuild Quote/Weidner - 79 Cambridge Ave Madison Park RebuildREV1- Incl Taxes.pdf",
      name: "preferred-decoy.pdf",
      contentType: "application/pdf",
      size: sourceText.length,
      classification: "quote",
      textSnippet: sourceText,
    },
  ]);
  await db.insert(importedVendorQuotesTable).values({
    id: `madison-draft-${suffix}`,
    importBatchId: batchId,
    ownerId,
    data: {
      id: `madison-draft-${suffix}`,
      quoteNumber: "NEWER-DRAFT-SHOULD-NOT-DISPLAY",
      projectId,
      projectName: project.name,
      vendorId: "luminova-construction",
      vendorName: "Luminova Construction",
      direction: "luminova_to_client",
      isProjectTotal: true,
      trade: "Client proposal",
      status: "Draft",
      revision: 2,
      issueDate: "2026-07-01",
      dueDate: "2026-07-31",
      notes: "",
      lineItems: [],
      total: 2000000,
      attachments: [],
      sourceRelativePaths: [],
      importConfidence: 100,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  });
  t.after(async () => {
    await db.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, [batchId, otherBatchId, mismatchedBatchId]));
    await db.delete(importedVendorQuotesTable).where(inArray(importedVendorQuotesTable.importBatchId, [batchId, otherBatchId, mismatchedBatchId]));
    await db.delete(projectDocumentsTable).where(inArray(projectDocumentsTable.importBatchId, [batchId, otherBatchId, mismatchedBatchId]));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.importBatchId, [batchId, otherBatchId, mismatchedBatchId]));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, [batchId, otherBatchId, mismatchedBatchId]));
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
  assert.equal((projectAfterRollback!.data as typeof project).invoiced, 1388786.55);
  assert.deepEqual(
    (projectAfterRollback!.data as typeof project).revenueAdjustments,
    project.revenueAdjustments,
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const organizationId = req.header("x-test-workspace") || null;
    const auth = Object.assign(
      () => ({ userId: ownerId, orgId: organizationId, tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, {
      userId: ownerId,
      auth,
      log: { error: () => undefined, warn: () => undefined },
    });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const crossWorkspaceResponse = await fetch(`http://127.0.0.1:${port}/projects/${projectId}`, {
    headers: { "x-test-workspace": `other-workspace-${suffix}` },
  });
  assert.equal(crossWorkspaceResponse.status, 404);
  const [projectAfterCrossWorkspaceRequest] = await db.select({ data: importedProjectsTable.data })
    .from(importedProjectsTable)
    .where(and(eq(importedProjectsTable.id, projectId), eq(importedProjectsTable.ownerId, ownerId)));
  assert.equal((projectAfterCrossWorkspaceRequest!.data as typeof project).invoiced, 1388786.55);
  assert.deepEqual(
    (projectAfterCrossWorkspaceRequest!.data as typeof project).revenueAdjustments,
    project.revenueAdjustments,
  );

  const firstResponse = await fetch(`http://127.0.0.1:${port}/projects/${projectId}`);
  assert.equal(firstResponse.status, 200);
  const firstProject = await firstResponse.json() as {
    invoiced: number;
    progress: number;
    clientQuote: { total: number };
    invoices: Array<{ amount: number; direction?: string; invoiceNumber: string }>;
  };
  assert.equal(firstProject.invoiced, 446070.71);
  assert.equal(firstProject.clientQuote.total, MADISON_PARK_CLIENT_QUOTE_TOTAL);
  assert.equal(firstProject.progress, 32.1);
  assert.deepEqual(
    firstProject.invoices
      .filter((invoice) => invoice.invoiceNumber === "MADISON-PARK-REV-2026-06-18")
      .map((invoice) => ({ amount: invoice.amount, direction: invoice.direction })),
    [],
  );
  const listResponse = await fetch(`http://127.0.0.1:${port}/projects`);
  assert.equal(listResponse.status, 200);
  const listedProjects = await listResponse.json() as Array<{
    id: string;
    invoiced: number;
    progress: number;
  }>;
  const listedProject = listedProjects.find((item) => item.id === projectId);
  assert.equal(listedProject?.invoiced, 446070.71);
  assert.equal(listedProject?.progress, 32.1);

  const dashboardResponse = await fetch(`http://127.0.0.1:${port}/dashboard/summary`);
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json() as { invoiced: number };
  assert.equal(dashboard.invoiced, 446070.71);

  const summaryResponse = await fetch(`http://127.0.0.1:${port}/invoices/summary`);
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json() as {
    invoicedRevenue: number;
    invoicedExpenses: number;
    acceptedClientQuoteValue: number;
    upcomingClientPayments: number;
  };
  assert.deepEqual(summary, {
    invoicedRevenue: 446070.71,
    invoicedExpenses: 196801.5,
    acceptedClientQuoteValue: MADISON_PARK_CLIENT_QUOTE_TOTAL,
    upcomingClientPayments: 942715.84,
  });

  const second = await applyMadisonParkRevenueCorrection(ownerId);
  assert.equal(second.applied, false);
  assert.equal(second.alreadyApplied, true);
  assert.equal(await applyMadisonParkRevenueCorrection(otherOwnerId).then((result) => result.applied), true);

  const [savedProject] = await db.select({ data: importedProjectsTable.data })
    .from(importedProjectsTable)
    .where(and(eq(importedProjectsTable.id, projectId), eq(importedProjectsTable.ownerId, ownerId)));
  const saved = savedProject!.data as typeof project & { revenueAdjustments: Array<{ key: string }> };
  assert.equal(saved.invoiced, 446070.71);
  assert.equal(saved.clientQuote.total, MADISON_PARK_CLIENT_QUOTE_TOTAL);
  assert.equal(saved.budgetLineItems[0].invoiced, 196801.5);
  assert.deepEqual(saved.revenueAdjustments, [
    {
      key: "unrelated-adjustment",
      amount: 25,
      sourceDocumentId: "unrelated-document",
      sourcePath: "unrelated.pdf",
    },
    {
      key: MADISON_PARK_REVENUE_CORRECTION_KEY,
      amount: 0,
      sourceDocumentId: documentId,
      sourcePath: "Building 79/Rebuild Quote/client-proposal.pdf",
    },
  ]);

  const savedInvoices = await db.select({ data: importedInvoicesTable.data })
    .from(importedInvoicesTable)
    .where(and(eq(importedInvoicesTable.ownerId, ownerId), eq(importedInvoicesTable.importBatchId, batchId)));
  assert.equal(savedInvoices.length, 1);
  const savedQuotes = await db.select({ data: importedVendorQuotesTable.data })
    .from(importedVendorQuotesTable)
    .where(and(eq(importedVendorQuotesTable.ownerId, ownerId), eq(importedVendorQuotesTable.importBatchId, batchId)));
  assert.equal(savedQuotes.length, 2);
  const correctionQuote = savedQuotes
    .map((row) => row.data as {
      correctionKey?: string;
      direction: string;
      status: string;
      isProjectTotal: boolean;
      sourceDocumentId: string;
      total: number;
    })
    .find((quote) => quote.correctionKey === MADISON_PARK_REVENUE_CORRECTION_KEY)!;
  assert.equal(correctionQuote.direction, "luminova_to_client");
  assert.equal(correctionQuote.status, "Accepted");
  assert.equal(correctionQuote.isProjectTotal, true);
  assert.equal(correctionQuote.sourceDocumentId, documentId);
  assert.equal(correctionQuote.total, MADISON_PARK_CLIENT_QUOTE_TOTAL);

  const otherQuotes = await db.select({ data: importedVendorQuotesTable.data })
    .from(importedVendorQuotesTable)
    .where(and(eq(importedVendorQuotesTable.ownerId, otherOwnerId), eq(importedVendorQuotesTable.importBatchId, otherBatchId)));
  assert.equal(otherQuotes.length, 1);
});
