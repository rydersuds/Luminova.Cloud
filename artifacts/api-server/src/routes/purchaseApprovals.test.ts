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
import type { Invoice, InvoiceInput, PurchaseApproval } from "@workspace/api-zod";
import { createInvoiceSubmissionRouter, type InvoiceSubmissionDependencies } from "./invoiceSubmissions";
import type { ApprovalEvent } from "../lib/approvalNotifications";

test("purchases within a trade budget auto-approve; over-budget spending waits for an Admin", async t => {
  const suffix = randomUUID();
  const admin = `admin-${suffix}`, pm = `pm-${suffix}`;
  const workspace = `approval-workspace-${suffix}`;
  const projectId = `approval-project-${suffix}`, batchId = `approval-batch-${suffix}`;
  const fileMetadata = new Map<string, { name: string; size: number; contentType: string }>();
  const events: ApprovalEvent[] = [];
  const notificationWarnings: unknown[] = [];
  let failNotifications = false;
  const storage: NonNullable<InvoiceSubmissionDependencies["storage"]> = {
    getObjectEntityUploadURL: async () => `https://uploads.invalid/objects/${randomUUID()}`,
    normalizeObjectEntityPath: url => new URL(url).pathname,
    verifyConstructionDocument: async input => {
      const uploaded = fileMetadata.get(input.objectPath);
      if (!uploaded || uploaded.size !== input.size) throw new Error("Incomplete upload");
    },
    setAcl: async () => undefined,
    getObjectEntityFile: async path => ({ name: path } as never),
    canRead: async () => true,
    downloadObject: async () => new Response(""),
  };

  await db.insert(projectImportBatchesTable).values({ id: batchId, projectId, ownerId: admin, workspaceId: workspace, status: "completed", manifest: [] });
  await db.insert(importedProjectsTable).values({
    id: projectId, importBatchId: batchId, ownerId: admin, workspaceId: workspace,
    data: {
      id: projectId, name: "Approval Test House", address: "", region: "Calgary", status: "Active", progress: 0,
      pmName: "PM", projectManagerId: pm, clientName: "", targetDate: "2027-01-01", budgeted: 5000, invoiced: 0,
      exteriorImage: "", description: "", clientQuote: { total: 0, revision: "", portions: [] },
      budgetLineItems: [{ id: "drywall", code: "09 29 00", description: "Drywall", budgeted: 5000, invoiced: 0 }],
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user");
    const auth = Object.assign(() => ({ userId, orgId: workspace, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
    Object.assign(req, { userId, auth, log: { error: () => undefined, warn: (context: unknown) => notificationWarnings.push(context) } });
    next();
  });
  app.use(createInvoiceSubmissionRouter({
    storage,
    role: async req => (req.userId === admin ? "Admin" : "Project Manager"),
    displayName: async userId => (userId === admin ? "Ryder Suds" : "Maya Chen"),
    notify: async (_req, event) => {
      events.push(event);
      if (failNotifications) throw new Error("email service unavailable");
    },
  }));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.close();
    await db.delete(purchaseApprovalsTable).where(eq(purchaseApprovalsTable.projectId, projectId));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.importBatchId, batchId));
    await db.delete(invoiceUploadReservationsTable).where(eq(invoiceUploadReservationsTable.projectId, projectId));
    await db.delete(importedInvoicesTable).where(eq(importedInvoicesTable.importBatchId, batchId));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.id, [projectId]));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, batchId));
  });

  const call = (path: string, user = pm, body?: unknown) => fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-test-user": user, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const remaining = async () => {
    const projects = await (await call("/invoice-projects")).json() as Array<{ categories: Array<{ remaining: number | null; budgeted: number | null }> }>;
    return projects[0].categories[0];
  };
  const check = async (amount: number, description = "Board and mud") => {
    const response = await call("/purchase-approvals", pm, { projectId, budgetLineItemId: "drywall", amount, vendor: "Akal Drywalling", description });
    assert.equal(response.status, 201);
    return response.json() as Promise<PurchaseApproval>;
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));

  // Within budget: approved on the spot, and the money is set aside.
  const withinBudget = await check(3000);
  assert.equal(withinBudget.status, "Auto-approved");
  assert.equal(withinBudget.remainingBefore, 5000);
  assert.equal((await remaining()).remaining, 2000, "an approved purchase reserves its amount");
  await settle();
  assert.equal(events.length, 0, "nobody is emailed about purchases that fit the budget");

  // Over budget: waits for an Admin, who is notified.
  const overBudget = await check(2500, "Extra board for the garage ceiling");
  assert.equal(overBudget.status, "Pending approval");
  assert.equal(overBudget.overage, 500);
  assert.equal(overBudget.requestedByName, "Maya Chen");
  assert.equal((await remaining()).remaining, 2000, "a pending request reserves nothing");
  await settle();
  assert.equal(events.at(-1)?.type, "requested");

  const pmDecision = await call(`/purchase-approvals/${overBudget.id}/decision`, pm, { decision: "approve" });
  assert.equal(pmDecision.status, 403, "only Admins approve over-budget spending");
  assert.equal((await call(`/purchase-approvals/${overBudget.id}/decision`, admin, { decision: "maybe" })).status, 400);

  const approved = await (await call(`/purchase-approvals/${overBudget.id}/decision`, admin, { decision: "approve", note: "Garage was added to scope", raiseBudget: true })).json() as PurchaseApproval;
  assert.equal(approved.status, "Approved");
  assert.equal(approved.decidedByName, "Ryder Suds");
  assert.equal(approved.budgetIncrease, 500);
  const afterApproval = await remaining();
  assert.equal(afterApproval.budgeted, 5500, "the trade budget is raised by exactly the overage");
  assert.equal(afterApproval.remaining, 0, "both approved purchases are now reserved against the new budget");
  await settle();
  assert.equal(events.at(-1)?.type, "decided");
  assert.equal(events.at(-1)?.approval.requestedById, pm, "the decision notification is addressed to the requester");
  assert.equal(events.filter(event => event.type === "decided" && event.approval.id === overBudget.id).length, 1, "the saved decision triggers one notification");
  assert.equal((await call(`/purchase-approvals/${overBudget.id}/decision`, admin, { decision: "decline" })).status, 409, "a request is decided once");

  // The invoice for the approved purchase claims it instead of being flagged again.
  const meta = { projectId, name: "invoice.pdf", size: 10, contentType: "application/pdf" as const };
  const slot = await (await call("/invoice-uploads", pm, meta)).json() as { objectPath: string };
  fileMetadata.set(slot.objectPath, meta);
  const invoiceInput: InvoiceInput = {
    projectId, amount: 2400, vendor: "Akal Drywalling", invoiceNumber: `AD-${suffix.slice(0, 8)}`, date: "2026-10-10",
    lineItem: "Drywall", budgetLineItemId: "drywall", submissionId: randomUUID(), attachment: { ...meta, objectPath: slot.objectPath },
  };
  const invoice = await (await call("/invoices", pm, invoiceInput)).json() as Invoice;
  assert.ok(["Auto-approved", "Approved"].includes(invoice.status), `invoice should not wait again, got ${invoice.status}`);
  assert.ok(invoice.purchaseApprovalId, "the invoice links to a purchase approval");
  assert.equal((await remaining()).remaining, 100, "the invoice replaces its purchase's reservation instead of adding to it");

  // A declined request reserves nothing and is listed for everyone who manages the project.
  const declined = await check(900, "Upgrade to moisture-resistant board");
  assert.equal(declined.status, "Pending approval");
  failNotifications = true;
  const declineResult = await (await call(`/purchase-approvals/${declined.id}/decision`, admin, { decision: "decline", note: "Standard board is fine" })).json() as PurchaseApproval;
  assert.equal(declineResult.status, "Declined");
  await settle();
  assert.equal(notificationWarnings.length, 1, "failed requester delivery is observable");
  assert.equal((await remaining()).remaining, 100);
  const listed = await (await call("/purchase-approvals")).json() as PurchaseApproval[];
  assert.deepEqual(new Set(listed.map(approval => approval.status)), new Set(["Auto-approved", "Approved", "Declined"]));
  assert.equal(events.filter(event => event.type === "decided" && event.approval.id === declined.id).length, 1);

  const [storedProject] = await db.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
  await db.update(importedProjectsTable)
    .set({ data: { ...(storedProject.data as Record<string, unknown>), budgetEnabled: false } })
    .where(eq(importedProjectsTable.id, projectId));
  const hiddenBudgets = await (await call("/invoice-projects")).json() as Array<{ budgetEnabled: boolean; categories: unknown[] }>;
  assert.equal(hiddenBudgets[0].budgetEnabled, false);
  assert.deepEqual(hiddenBudgets[0].categories, [], "disabled projects expose no trade limits");
  const externalPurchaseResponse = await call("/purchase-approvals", pm, {
    projectId, budgetLineItemId: null, amount: 700, vendor: "Akal Drywalling", description: "Additional materials",
  });
  assert.equal(externalPurchaseResponse.status, 201);
  const externalPurchase = await externalPurchaseResponse.json() as PurchaseApproval;
  assert.equal(externalPurchase.status, "Pending approval");
  assert.equal(externalPurchase.approvalReason, "external_authorization_required");
  assert.equal(externalPurchase.budgetLineItemId, null);
  assert.equal(externalPurchase.remainingBefore, null);
  assert.equal(externalPurchase.overage, 0);
  const externalDecision = await call(`/purchase-approvals/${externalPurchase.id}/decision`, admin, { decision: "approve" });
  assert.equal(externalDecision.status, 409, "externally authorized requests cannot be approved in the app");
});
