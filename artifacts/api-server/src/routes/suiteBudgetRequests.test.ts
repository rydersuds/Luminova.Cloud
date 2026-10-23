import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import {
  db, importedProjectsTable, importedInvoicesTable, projectImportBatchesTable,
  projectDocumentsTable, invoiceUploadReservationsTable, purchaseApprovalsTable,
} from "@workspace/db";
import type { Invoice, InvoiceProject, ProjectBudgetUnit, PurchaseApproval } from "@workspace/api-zod";
import { createInvoiceSubmissionRouter, type InvoiceSubmissionDependencies } from "./invoiceSubmissions";
import { unitDocumentTestPdf } from "../lib/unitDocumentTestPdf";

test("numbered suites persist and isolate requests, concurrent reservations, invoice matching, and shared costs", async t => {
  const suffix = randomUUID(), workspace = `suites-${suffix}`, admin = `admin-${suffix}`, pm = `pm-${suffix}`;
  const projectId = `project-${suffix}`, batchId = `batch-${suffix}`;
  const units: ProjectBudgetUnit[] = [
    { id: randomUUID(), label: "101", unitTypeId: "one" },
    { id: randomUUID(), label: "102", unitTypeId: "one" },
  ];
  const documentPdf = unitDocumentTestPdf([
    "Rebuild revision scope for residential project",
    "Main Floor Plan (Units 101, 102)",
    "All finishing and fixtures are included in the residential scope of work.",
    "Unit numbers are shown on this floor plan. No dwelling type is assigned.",
  ]);
  const storage: NonNullable<InvoiceSubmissionDependencies["storage"]> = {
    getObjectEntityUploadURL: async () => `https://uploads.invalid/objects/${randomUUID()}`,
    normalizeObjectEntityPath: url => new URL(url).pathname,
    verifyConstructionDocument: async () => undefined,
    setAcl: async () => undefined,
    getObjectEntityFile: async path => ({ name: path } as never),
    canRead: async () => true,
    downloadObject: async () => new Response(documentPdf),
  };
  await db.insert(projectImportBatchesTable).values({ id: batchId, projectId, ownerId: admin, workspaceId: workspace, status: "completed", manifest: [] });
  await db.insert(importedProjectsTable).values({
    id: projectId, importBatchId: batchId, ownerId: admin, workspaceId: workspace,
    data: {
      id: projectId, name: "Suite integration project", projectManagerId: pm,
      budgetLineItems: [{ id: "legacy", code: "IB-1", description: "Drywall", budgeted: 200, invoiced: 0 }],
      unitBudget: {
        total: 250,
        unitTypes: [{ id: "one", name: "1 Bedroom", unitCount: 2, perUnitTotal: 100, total: 200,
          categoryBudgets: [{ category: "Drywall", budgeted: 100 }], lineItems: [] }],
        sharedAreas: [{ id: "common", name: "Common areas", total: 50, lineItems: [] }],
      },
    },
  });
  await db.insert(projectDocumentsTable).values([
    { id: `source-${suffix}`, projectId, importBatchId: batchId, ownerId: admin },
    { id: `wrong-owner-${suffix}`, projectId, importBatchId: batchId, ownerId: "other-owner" },
    { id: `wrong-project-${suffix}`, projectId: "other-project", importBatchId: batchId, ownerId: admin },
    { id: `wrong-batch-${suffix}`, projectId, importBatchId: `other-batch-${suffix}`, ownerId: admin },
  ].map((source, index) => ({
    ...source, objectPath: `/objects/${source.id}`, relativePath: `RebuildREV${index + 1}.pdf`,
    name: `RebuildREV${index + 1}.pdf`, size: documentPdf.length,
    contentType: "application/pdf", classification: "quote",
  })));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user");
    const auth = Object.assign(() => ({ userId, orgId: req.header("x-test-workspace") || workspace, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
    Object.assign(req, { userId, auth, log: { error: () => undefined, warn: () => undefined } });
    next();
  });
  app.use(createInvoiceSubmissionRouter({
    storage, role: async req => req.userId === admin ? "Admin" : req.userId === "client" ? "Client" : "Project Manager",
    displayName: async () => "Suite tester", notify: async () => undefined,
  }));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.close();
    await db.delete(purchaseApprovalsTable).where(eq(purchaseApprovalsTable.projectId, projectId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.importBatchId, batchId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.id, `wrong-batch-${suffix}`));
    await db.delete(invoiceUploadReservationsTable).where(eq(invoiceUploadReservationsTable.projectId, projectId));
    await db.delete(importedInvoicesTable).where(eq(importedInvoicesTable.importBatchId, batchId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, batchId));
  });
  const call = (path: string, method = "GET", body?: unknown, user = pm) => fetch(`${base}${path}`, {
    method, headers: { "x-test-user": user, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const save = async (value: ProjectBudgetUnit[], user = pm) => {
    const baseVersion = (await current()).registerVersion;
    return call(`/projects/${projectId}/budget-units`, "PATCH", { units: value, baseVersion }, user);
  };
  const current = async () => ((await (await call("/invoice-projects")).json()) as InvoiceProject[])[0];
  const purchase = (id: string | null, amount: number) => call("/purchase-approvals", "POST", {
    projectId, budgetLineItemId: id, amount, vendor: "Test vendor", description: "Suite materials",
  });
  const extractPath = `/projects/${projectId}/documented-units`;
  assert.equal((await call(extractPath, "POST", undefined, "unassigned-pm")).status, 404);
  assert.equal((await call(extractPath, "POST", undefined, "client")).status, 403);
  assert.equal((await fetch(`${base}${extractPath}`, { method: "POST", headers: { "x-test-user": admin, "x-test-workspace": "different-workspace" } })).status, 404);
  const extractedResponse = await call(extractPath, "POST");
  assert.equal(extractedResponse.status, 200);
  const extracted = await extractedResponse.json() as { candidates: Array<{ label: string; unitTypeId: string | null; evidence: Array<{ documentId: string; page: number }> }>; sources: Array<{ documentId: string }> };
  assert.deepEqual(extracted.candidates.map(c => c.label), ["101", "102"]);
  assert.ok(extracted.candidates.every(c => c.unitTypeId === null && c.evidence[0].page === 1));
  assert.deepEqual(extracted.sources.map(s => s.documentId), [`source-${suffix}`]);
  assert.deepEqual((await current()).units, [], "review alone never persists units");
  const baseVersion = (await current() as InvoiceProject & { registerVersion: string }).registerVersion;
  const [beforeReview] = await db.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
  const initialBudget = (beforeReview.data as { unitBudget: unknown }).unitBudget;

  assert.equal((await save(units, "unassigned-pm")).status, 404);
  assert.equal((await save([{ ...units[0], label: " " }])).status, 400);
  assert.equal((await save([units[0], { ...units[1], label: "101" }])).status, 400);
  assert.equal((await save([...units, { id: randomUUID(), label: "103", unitTypeId: "one" }])).status, 400);
  assert.equal((await save(units)).status, 200);
  assert.equal((await call(`/projects/${projectId}/budget-units`, "PATCH", { units })).status, 400, "a version is mandatory to avoid lost updates");
  assert.equal((await save([{ ...units[0], id: randomUUID() }, units[1]])).status, 409, "existing suite IDs are retained even before purchases exist");
  assert.equal((await call(`/projects/${projectId}/budget-units`, "PATCH", { units, baseVersion })).status, 409, "stale drafts cannot overwrite newer saved suites");
  const confirmedVersion = (await current() as InvoiceProject & { registerVersion: string }).registerVersion;
  assert.equal((await call(`/projects/${projectId}/budget-units`, "PATCH", { units, baseVersion: confirmedVersion })).status, 200);
  assert.equal((await call(`/projects/${projectId}/budget-units`, "PATCH", { units, baseVersion: confirmedVersion })).status, 200, "identical confirmation is idempotent");
  assert.equal((await call(extractPath, "POST")).status, 200);
  let project = await current();
  assert.deepEqual(project.units, units);
  assert.equal(project.unitBudgetEnabled, true);
  assert.equal(project.allocationWarning, null);
  const first = project.categories.find(c => c.unitId === units[0].id)!;
  const second = project.categories.find(c => c.unitId === units[1].id)!;
  const shared = project.categories.find(c => c.scopeKind === "shared")!;
  assert.equal(first.budgeted, 100);
  assert.equal((await purchase("legacy", 1)).status, 400, "project-wide categories cannot bypass suite allocation");
  assert.equal((await purchase(null, 1)).status, 400);
  const request = await (await purchase(first.id, 80)).json() as PurchaseApproval;
  assert.equal(request.status, "Auto-approved");
  assert.equal(request.tradeLabel, "101 · Drywall");
  project = await current();
  assert.equal(project.categories.find(c => c.id === first.id)!.remaining, 20);
  assert.equal(project.categories.find(c => c.id === second.id)!.remaining, 100);
  assert.equal(project.categories.find(c => c.id === shared.id)!.remaining, 50);
  assert.equal((await save([units[1]])).status, 409, "a suite with activity cannot disappear");
  assert.equal((await call(extractPath, "POST")).status, 200);
  assert.deepEqual((await current()).units, units, "repeat extraction preserves linked suite identifiers");
  const renamed = [{ ...units[0], label: "Suite 101" }, units[1]];
  assert.equal((await save(renamed)).status, 200);
  assert.equal((await current()).categories.find(c => c.id === first.id)!.unitLabel, "Suite 101");

  const invoiceInput = async (categoryId: string | null, amount: number) => {
    const upload = await (await call("/invoice-uploads", "POST", {
      projectId, name: "invoice.pdf", size: 10, contentType: "application/pdf",
    })).json() as { objectPath: string };
    return {
      submissionId: randomUUID(), projectId, invoiceNumber: randomUUID(), vendor: "Test vendor",
      amount, date: "2026-10-23", lineItem: "Materials", budgetLineItemId: categoryId,
      attachment: { objectPath: upload.objectPath, name: "invoice.pdf", size: 10, contentType: "application/pdf" },
    };
  };
  const wrongScope = await (await call("/invoices", "POST", await invoiceInput(second.id, 70))).json() as Invoice;
  assert.equal(wrongScope.purchaseApprovalId, null, "suite 102's invoice cannot claim suite 101's purchase");
  const matchingInput = await invoiceInput(first.id, 60);
  const matching = await (await call("/invoices", "POST", matchingInput)).json() as Invoice;
  assert.equal(matching.purchaseApprovalId, request.id);
  assert.equal((await call("/invoices", "POST", matchingInput)).status, 201, "same-suite retry is idempotent");
  assert.equal((await call("/invoices", "POST", { ...matchingInput, budgetLineItemId: second.id })).status, 409);
  assert.equal((await call("/invoices", "POST", await invoiceInput(null, 1))).status, 400);
  project = await current();
  assert.equal(project.categories.find(c => c.id === first.id)!.remaining, 40, "invoice replaces the purchase reservation");
  assert.equal(project.categories.find(c => c.id === second.id)!.remaining, 30);
  const simultaneous = await Promise.all([purchase(first.id, 30), purchase(first.id, 30)]);
  const statuses = await Promise.all(simultaneous.map(async response => {
    assert.equal(response.status, 201); return (await response.json() as PurchaseApproval).status;
  }));
  assert.deepEqual(statuses.sort(), ["Auto-approved", "Pending approval"], "project lock prevents double spending one suite");
  assert.equal((await (await purchase(shared.id, 25)).json() as PurchaseApproval).status, "Auto-approved");
  project = await current();
  assert.equal(project.categories.find(c => c.id === shared.id)!.remaining, 25);
  assert.equal(project.categories.find(c => c.id === second.id)!.remaining, 30);
  const [afterReview] = await db.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
  assert.deepEqual((afterReview.data as { unitBudget: unknown }).unitBudget, initialBudget, "extraction and register confirmation never change source totals or allowances");
});
