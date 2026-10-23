import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import {
  db, importedProjectsTable, importedInvoicesTable, projectImportBatchesTable,
  projectDocumentsTable, invoiceUploadReservationsTable, purchaseApprovalsTable,
} from "@workspace/db";
import type { InvoiceInput, Invoice } from "@workspace/api-zod";
import { createInvoiceSubmissionRouter, type InvoiceSubmissionDependencies } from "./invoiceSubmissions";
import luminovaRouter from "./luminova";

test("purchase invoices persist, enforce assigned-project scope, and apply cumulative trade budgets", async t => {
  const suffix = randomUUID();
  const admin = `admin-${suffix}`, pm = `pm-${suffix}`, outsider = `outsider-${suffix}`;
  const workspace = `purchase-workspace-${suffix}`, privateWorkspace = `private-workspace-${suffix}`;
  const projectIds = [0, 1, 2, 3].map(index => `purchase-project-${index}-${suffix}`);
  const batchIds = projectIds.map((_, index) => `import-batch-${index}-${suffix}`);
  const fileMetadata = new Map<string, { name: string; size: number; contentType: string }>();
  const acls = new Map<string, string>();
  const storage: NonNullable<InvoiceSubmissionDependencies["storage"]> = {
    getObjectEntityUploadURL: async () => `https://uploads.invalid/objects/${randomUUID()}`,
    normalizeObjectEntityPath: url => new URL(url).pathname,
    verifyConstructionDocument: async input => {
      const uploaded = fileMetadata.get(input.objectPath);
      if (!uploaded || uploaded.name !== input.name || uploaded.size !== input.size || uploaded.contentType !== input.contentType) throw new Error("Incomplete upload");
    },
    setAcl: async (path, acl) => { acls.set(path, acl.owner); },
    getObjectEntityFile: async path => ({ name: path } as never),
    canRead: async (userId, file) => acls.get(file.name) === userId,
    downloadObject: async () => new Response("test invoice bytes", { headers: { "Content-Type": "application/pdf" } }),
  };
  const fixtureProject = (id: string, baseline: number, budgetEnabled?: boolean) => ({
    id, name: `Invoice Test ${id}`, address: "1 Test St", region: "Calgary", status: "Active",
    progress: 0, pmName: "Assigned Manager", projectManagerId: pm, clientName: "Test Client",
    startDate: "2026-01-01", targetDate: "2027-01-01", budgeted: 10000, invoiced: 0,
    exteriorImage: "", description: "Invoice budget test", clientQuote: { total: 0, revision: "", portions: [] },
    budgetLineItems: [{ id: "drywall", code: "09 29 00", description: "Drywall", budgeted: 10000, invoiced: baseline, variance: 10000 - baseline }],
    ...(budgetEnabled === undefined ? {} : { budgetEnabled }),
  });
  await db.insert(projectImportBatchesTable).values(projectIds.map((projectId, index) => ({
    id: batchIds[index], projectId, ownerId: admin, workspaceId: index === 2 ? privateWorkspace : workspace, status: "completed", manifest: [],
  })));
  await db.insert(importedProjectsTable).values(projectIds.map((id, index) => ({
    id, importBatchId: batchIds[index], ownerId: admin, workspaceId: index === 2 ? privateWorkspace : workspace,
    data: fixtureProject(id, index === 0 ? 2000 : 0, index === 3 ? false : undefined),
  })));
  await db.insert(importedInvoicesTable).values({
    id: `legacy-cost-${suffix}`, ownerId: admin, importBatchId: batchIds[0],
    data: { id: `legacy-cost-${suffix}`, projectId: projectIds[0], projectName: "Test", invoiceNumber: "LEGACY",
      vendor: "Legacy vendor", amount: 2000, date: "2026-01-01", direction: "company_to_luminova",
      status: "Approved", lineItem: "09 29 00 · Drywall", overage: 0 },
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user");
    const orgId = req.header("x-test-workspace") || workspace;
    const auth = Object.assign(() => ({ userId, orgId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
    Object.assign(req, { userId, auth, log: { error: () => undefined } });
    next();
  });
  const makeRouter = () => createInvoiceSubmissionRouter({
    storage, role: async req => req.userId === admin ? "Admin" : req.userId === "field-user" ? "Field Team" : "Project Manager",
    displayName: async () => "Test user", notify: async () => undefined,
  });
  app.use(makeRouter());
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.close();
    await db.delete(purchaseApprovalsTable).where(inArray(purchaseApprovalsTable.projectId, projectIds));
    await db.delete(projectDocumentsTable).where(inArray(projectDocumentsTable.importBatchId, batchIds));
    await db.delete(invoiceUploadReservationsTable).where(inArray(invoiceUploadReservationsTable.projectId, projectIds));
    await db.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, batchIds));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.id, projectIds));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds));
  });
  const request = (path: string, user = pm, body?: unknown, scope = workspace) => fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-test-user": user, "x-test-workspace": scope, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const patchProject = (projectId: string, user: string, body: unknown) => fetch(`${base}/projects/${projectId}`, {
    method: "PATCH",
    headers: { "x-test-user": user, "x-test-workspace": workspace, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const prepare = async (projectId: string, amount: number, user = pm): Promise<InvoiceInput> => {
    const meta = { projectId, name: "invoice.pdf", size: 18, contentType: "application/pdf" as const };
    const response = await request("/invoice-uploads", user, meta);
    assert.equal(response.status, 200);
    const slot = await response.json() as { objectPath: string };
    fileMetadata.set(slot.objectPath, meta);
    return { projectId, amount, vendor: "Drywall Vendor", invoiceNumber: randomUUID(), date: "2026-10-02",
      lineItem: "Drywall", budgetLineItemId: "drywall", submissionId: randomUUID(),
      attachment: { ...meta, objectPath: slot.objectPath } };
  };
  const submit = (input: InvoiceInput, user = pm) => request("/invoices", user, input);

  const available = await (await request("/invoice-projects")).json() as Array<{ id: string; registerVersion: string; budgetEnabled: boolean; categories: Array<{ remaining: number }> }>;
  assert.equal(available.length, 3);
  assert.equal(available.find(project => project.id === projectIds[0])?.categories[0].remaining, 8000);
  assert.equal(available.find(project => project.id === projectIds[0])?.budgetEnabled, true, "omitted legacy settings default to enabled");
  const { registerVersion, ...disabledProject } = available.find(project => project.id === projectIds[3])!;
  assert.match(registerVersion, /^[a-f0-9]{64}$/, "register concurrency version is present even when budget amounts are hidden");
  assert.deepEqual(disabledProject, {
    id: projectIds[3], name: `Invoice Test ${projectIds[3]}`, budgetEnabled: false, categories: [],
  }, "disabled project budgets are not exposed to invoice checks");
  assert.equal((await patchProject(projectIds[3], pm, { budgetEnabled: true })).status, 404, "only the project owner can change this setting");
  assert.equal((await patchProject(projectIds[3], admin, { budgetEnabled: "false" })).status, 400, "the setting must be a boolean");
  assert.deepEqual(await (await request("/invoice-projects", outsider)).json(), []);
  assert.equal((await request("/invoice-projects", "field-user")).status, 403);
  assert.equal((await fetch(`${base}/invoice-projects`)).status, 401);
  assert.equal((await request("/invoice-uploads", pm, { projectId: projectIds[2], name: "invoice.pdf", size: 18, contentType: "application/pdf" })).status, 404);
  assert.equal((await request("/invoice-uploads", outsider, { projectId: projectIds[0], name: "invoice.pdf", size: 18, contentType: "application/pdf" })).status, 404);

  const input = await prepare(projectIds[0], 6000);
  const first = await submit(input);
  assert.equal(first.status, 201);
  const approved = await first.json() as Invoice;
  assert.equal(approved.status, "Auto-approved");
  assert.equal(approved.budgetRemainingBefore, 8000);
  assert.equal(approved.budgetRemainingAfter, 2000);
  assert.equal(approved.direction, "company_to_luminova");
  assert.equal(approved.submittedById, pm);
  const retried = await submit(input);
  assert.equal(retried.status, 201);
  assert.equal((await retried.json() as Invoice).id, approved.id);
  assert.equal((await submit({ ...input, amount: 1 })).status, 409);

  const duplicate = await prepare(projectIds[0], 6000);
  duplicate.invoiceNumber = input.invoiceNumber;
  assert.equal((await submit(duplicate)).status, 409);
  const over = await submit(await prepare(projectIds[0], 2500));
  assert.equal(over.status, 201);
  const pending = await over.json() as Invoice;
  assert.equal(pending.status, "Pending approval");
  assert.equal(pending.approvalReason, "over_budget");
  assert.equal(pending.overage, 500);
  const list = await (await request("/invoice-submissions")).json() as Invoice[];
  assert.deepEqual(new Set(list.map(invoice => invoice.id)), new Set([approved.id, pending.id]));
  assert.deepEqual(await (await request("/invoice-submissions", outsider)).json(), []);
  assert.deepEqual(await (await request("/invoice-submissions", admin, undefined, privateWorkspace)).json(), []);
  assert.equal((await request(approved.attachment!.url!.replace("/api", ""), outsider)).status, 404);
  const download = await request(approved.attachment!.url!.replace("/api", ""));
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "test invoice bytes");

  const financial = await (await request("/invoices/summary", admin)).json() as { invoicedExpenses: number };
  assert.equal(financial.invoicedExpenses, 10500);
  const detail = await (await request(`/projects/${projectIds[0]}`, admin)).json() as { lineItems: Array<{ invoiced: number }> };
  assert.equal(detail.lineItems[0].invoiced, 10500);

  // Concurrent invoices share the same locked project budget, never the same available balance.
  const concurrent = await Promise.all([prepare(projectIds[1], 6000), prepare(projectIds[1], 6000)]);
  const results = await Promise.all(concurrent.map(async item => {
    const response = await submit(item); assert.equal(response.status, 201); return response.json() as Promise<Invoice>;
  }));
  assert.deepEqual(results.map(invoice => invoice.status).sort(), ["Auto-approved", "Pending approval"]);
  assert.equal(results.find(invoice => invoice.status === "Pending approval")?.overage, 2000);
  const badDate = await prepare(projectIds[1], 1);
  assert.equal((await submit({ ...badDate, date: "2026-13-01" })).status, 400);
  assert.equal((await submit({ ...badDate, amount: -1 })).status, 400);
  assert.equal((await submit({ ...badDate, amount: 1.001 })).status, 400);
  assert.equal((await submit({ ...badDate, budgetLineItemId: "another-project-category" })).status, 400);
  const reservationByAnotherUser = await prepare(projectIds[1], 1, admin);
  assert.equal((await submit(reservationByAnotherUser)).status, 400);
  assert.equal((await submit({ ...badDate, projectId: projectIds[0] })).status, 400);
  fileMetadata.delete(badDate.attachment.objectPath);
  assert.equal((await submit(badDate)).status, 400);

  // A newly constructed router reads the same permanent records, not process-local state.
  const fresh = express(); fresh.use(express.json());
  fresh.use((req, _res, next) => {
    Object.assign(req, { userId: pm, auth: Object.assign(() => ({ userId: pm, orgId: workspace, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true }) });
    next();
  });
  fresh.use(makeRouter());
  const freshServer = fresh.listen(0);
  await new Promise<void>(resolve => freshServer.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(freshServer.address() as AddressInfo).port}/invoice-submissions`);
    assert.equal((await response.json() as Invoice[]).length, 4);
  } finally { freshServer.close(); }
  const unknown = await prepare(projectIds[1], 1);
  const unknownResponse = await submit({ ...unknown, budgetLineItemId: null, lineItem: "Other trade" });
  assert.equal(unknownResponse.status, 201);
  assert.equal((await unknownResponse.json() as Invoice).approvalReason, "budget_unavailable");
  const projectBudget = await (await request("/invoice-projects")).json() as Array<{ id: string; categories: Array<{ remaining: number | null }> }>;
  assert.equal(projectBudget.find(project => project.id === projectIds[1])?.categories[0].remaining, null);
  const reenabled = await patchProject(projectIds[3], admin, { budgetEnabled: true });
  assert.equal(reenabled.status, 200);
  assert.equal((await reenabled.json() as { budgetEnabled: boolean }).budgetEnabled, true);
  const scheduleClosed = await patchProject(projectIds[3], admin, { scheduleAvailable: false });
  assert.equal(scheduleClosed.status, 200);
  assert.equal((await scheduleClosed.json() as { scheduleAvailable: boolean }).scheduleAvailable, false);
  const scheduleAfterReload = await (await request(`/projects/${projectIds[3]}`, admin)).json() as { scheduleAvailable: boolean };
  assert.equal(scheduleAfterReload.scheduleAvailable, false, "schedule availability persists while the board is hidden");
  const scheduleReopened = await patchProject(projectIds[3], admin, { scheduleAvailable: true });
  assert.equal((await scheduleReopened.json() as { scheduleAvailable: boolean }).scheduleAvailable, true);
  const restored = await (await request("/invoice-projects")).json() as Array<{ id: string; budgetEnabled: boolean; categories: Array<{ budgeted: number | null }> }>;
  assert.equal(restored.find(project => project.id === projectIds[3])?.categories[0].budgeted, 10000, "retained budget categories return when re-enabled");
  const restoredPurchaseResponse = await request("/purchase-approvals", pm, {
    projectId: projectIds[3], budgetLineItemId: "drywall", amount: 100, description: "Budget check after re-enabling",
  });
  assert.equal(restoredPurchaseResponse.status, 201);
  const restoredPurchase = await restoredPurchaseResponse.json() as { status: string; approvalReason: string };
  assert.equal(restoredPurchase.status, "Auto-approved");
  assert.equal(restoredPurchase.approvalReason, "within_budget", "normal budget checks resume after re-enabling");
  const disabledAgain = await patchProject(projectIds[3], admin, { budgetEnabled: false });
  assert.equal((await disabledAgain.json() as { budgetEnabled: boolean }).budgetEnabled, false);
  const disabledProjects = await (await request("/invoice-projects")).json() as Array<{ id: string; categories: unknown[] }>;
  assert.deepEqual(disabledProjects.find(project => project.id === projectIds[3])?.categories, []);
  const disabledInvoiceInput = await prepare(projectIds[3], 1234);
  const disabledInvoiceResponse = await submit(disabledInvoiceInput);
  assert.equal(disabledInvoiceResponse.status, 201);
  const disabledInvoice = await disabledInvoiceResponse.json() as Invoice;
  assert.equal(disabledInvoice.status, "Pending approval");
  assert.equal(disabledInvoice.approvalReason, "external_authorization_required");
  assert.equal(disabledInvoice.overage, 0);
  assert.equal(disabledInvoice.budgetRemainingBefore, null);
  assert.equal(disabledInvoice.budgetLineItemId, null);
  const externalApprovalRows = await db.select().from(purchaseApprovalsTable)
    .where(eq(purchaseApprovalsTable.projectId, projectIds[3]));
  assert.equal(externalApprovalRows.length, 2);
  assert.equal(externalApprovalRows.find(row => row.approvalReason === "external_authorization_required")?.status, "Pending approval");
  assert.ok(externalApprovalRows.some(row => row.status === "Auto-approved" && row.approvalReason === "within_budget"));
  const stored = await db.select().from(importedInvoicesTable).where(eq(importedInvoicesTable.id, approved.id));
  assert.equal(stored[0].ownerId, admin);
});