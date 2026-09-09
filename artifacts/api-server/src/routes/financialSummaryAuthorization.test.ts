import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { inArray } from "drizzle-orm";
import {
  db,
  importedInvoicesTable,
  importedProjectsTable,
  importedVendorsTable,
  importedVendorQuotesTable,
  projectImportBatchesTable,
} from "@workspace/db";
import luminovaRouter from "./luminova";

test("portfolio financial summary only includes the authenticated owner's records", async (t) => {
  const suffix = randomUUID();
  const ownerId = `financial-owner-${suffix}`;
  const otherOwnerId = `financial-other-${suffix}`;
  const batchIds = [`financial-batch-a-${suffix}`, `financial-batch-b-${suffix}`];

  await db.insert(projectImportBatchesTable).values([
    { id: batchIds[0], projectId: `project-a-${suffix}`, ownerId, status: "completed", manifest: [] },
    { id: batchIds[1], projectId: `project-b-${suffix}`, ownerId: otherOwnerId, status: "completed", manifest: [] },
  ]);
  await db.insert(importedProjectsTable).values([
    {
      id: `project-a-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `project-a-${suffix}`, name: "Owned project", address: "1 Test Street", region: "Calgary",
        status: "Planning", progress: 0, pmName: "Test PM", clientName: "Test Client",
        targetDate: "2026-12-31", budgeted: 1200, invoiced: 375, exteriorImage: "", description: "Test project",
        clientQuote: { total: 1000, revision: "Q-A", portions: [] },
        budgetLineItems: [{ id: "actual-a", code: "ACT-01", description: "Verified internal cost", budgeted: 50, invoiced: 50, variance: -50 }],
      },
    },
    {
      id: `project-b-${suffix}`,
      importBatchId: batchIds[1],
      ownerId: otherOwnerId,
      data: {
        id: `project-b-${suffix}`, name: "Other project", address: "2 Test Street", region: "Edmonton",
        status: "Planning", progress: 0, pmName: "Other PM", clientName: "Other Client",
        targetDate: "2027-01-31", budgeted: 20000, invoiced: 9000, exteriorImage: "", description: "Other project",
      },
    },
  ]);
  await db.insert(importedVendorsTable).values([
    {
      id: `trade-a-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `trade-a-${suffix}`, companyName: "Owned Trade", contactName: "Alex",
        tradeType: "Electrical", region: "Calgary", rating: 0, reviewCount: 0,
        completedJobs: 0, initials: "OT", accent: "#000000",
      },
    },
    {
      id: `trade-luminova-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `trade-luminova-${suffix}`, companyName: "Luminova Construction", contactName: "Owner",
        tradeType: "Construction owner", region: "Calgary", rating: 0, reviewCount: 0,
        completedJobs: 0, initials: "LC", accent: "#000000",
      },
    },
    {
      id: `trade-weidner-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `trade-weidner-${suffix}`, companyName: "Weidner Apartment Homes", contactName: "Client",
        tradeType: "Client", region: "Calgary", rating: 0, reviewCount: 0,
        completedJobs: 0, initials: "WA", accent: "#000000",
      },
    },
    {
      id: `trade-b-${suffix}`,
      importBatchId: batchIds[1],
      ownerId: otherOwnerId,
      data: {
        id: `trade-b-${suffix}`, companyName: "Owned Trade", contactName: "Other",
        tradeType: "Electrical", region: "Calgary", rating: 0, reviewCount: 0,
        completedJobs: 0, initials: "OT", accent: "#000000",
      },
    },
  ]);
  await db.insert(importedInvoicesTable).values([
    {
      id: `invoice-a-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `invoice-a-${suffix}`, invoiceNumber: "CLIENT-A", projectId: `project-a-${suffix}`,
        projectName: "Owned project", vendor: "Client", direction: "luminova_to_client",
        amount: 300, date: "2026-09-01", status: "Approved", lineItem: "Progress", overage: 0,
      },
    },
    {
      id: `invoice-expense-a-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `invoice-expense-a-${suffix}`, invoiceNumber: "EXPENSE-A", projectId: `project-a-${suffix}`,
        projectName: "Owned project", vendor: "Owned Trade", direction: "company_to_luminova",
        amount: 25, date: "2026-09-03", status: "Approved", lineItem: "Electrical", overage: 0,
      },
    },
    {
      id: `invoice-legacy-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `invoice-legacy-${suffix}`, invoiceNumber: "LEGACY-A", projectId: `project-a-${suffix}`,
        projectName: "Owned project", vendor: "Trade", amount: 75, date: "2026-09-02",
        status: "Approved", lineItem: "Electrical", overage: 0,
      },
    },
    {
      id: `invoice-expense-b-${suffix}`,
      importBatchId: batchIds[1],
      ownerId: otherOwnerId,
      data: {
        id: `invoice-expense-b-${suffix}`, invoiceNumber: "EXPENSE-B", projectId: `project-b-${suffix}`,
        projectName: "Other project", vendor: "Owned Trade", direction: "company_to_luminova",
        amount: 9000, date: "2026-09-03", status: "Approved", lineItem: "Electrical", overage: 0,
      },
    },
    {
      id: `invoice-b-${suffix}`,
      importBatchId: batchIds[1],
      ownerId: otherOwnerId,
      data: {
        id: `invoice-b-${suffix}`, invoiceNumber: "CLIENT-B", projectId: `project-b-${suffix}`,
        projectName: "Other project", vendor: "Other client", direction: "luminova_to_client",
        amount: 9000, date: "2026-09-01", status: "Approved", lineItem: "Progress", overage: 0,
      },
    },
  ]);
  await db.insert(importedVendorQuotesTable).values([
    {
      id: `quote-a-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `quote-a-${suffix}`, quoteNumber: "Q-A", projectId: `project-a-${suffix}`,
        projectName: "Owned project", vendorId: "luminova-construction", vendorName: "Luminova Construction",
        direction: "luminova_to_client", isProjectTotal: true, trade: "General", status: "Accepted",
        revision: 1, issueDate: "2026-08-01", dueDate: "2026-08-15", notes: "",
        lineItems: [{ id: "line-a", description: "Project", quantity: 1, unitPrice: 1000, amount: 1000 }],
        total: 1000, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
    {
      id: `quote-b-${suffix}`,
      importBatchId: batchIds[1],
      ownerId: otherOwnerId,
      data: {
        id: `quote-b-${suffix}`, quoteNumber: "Q-B", projectId: `project-b-${suffix}`,
        projectName: "Other project", vendorId: "luminova-construction", vendorName: "Luminova Construction",
        direction: "luminova_to_client", isProjectTotal: true, trade: "General", status: "Accepted",
        revision: 1, issueDate: "2026-08-01", dueDate: "2026-08-15", notes: "",
        lineItems: [{ id: "line-b", description: "Project", quantity: 1, unitPrice: 20000, amount: 20000 }],
        total: 20000, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
    {
      id: `quote-incoming-${suffix}`,
      importBatchId: batchIds[0],
      ownerId,
      data: {
        id: `quote-incoming-${suffix}`, quoteNumber: "Q-IN", projectId: `project-a-${suffix}`,
        projectName: "Owned project", vendorId: `trade-a-${suffix}`, vendorName: "Owned Trade",
        direction: "company_to_luminova", isProjectTotal: false, trade: "Electrical", status: "Received",
        revision: 1, issueDate: "2026-08-02", dueDate: "2026-08-16", notes: "",
        lineItems: [{ id: "line-in", description: "Electrical", quantity: 1, unitPrice: 500, amount: 500 }],
        total: 500, createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z",
      },
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = req.header("x-test-user");
    if (actor) Object.assign(req, { userId: actor });
    next();
  });
  app.use(luminovaRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  t.after(async () => {
    server.close();
    await db.delete(importedInvoicesTable).where(inArray(importedInvoicesTable.importBatchId, batchIds));
    await db.delete(importedVendorQuotesTable).where(inArray(importedVendorQuotesTable.importBatchId, batchIds));
    await db.delete(importedVendorsTable).where(inArray(importedVendorsTable.importBatchId, batchIds));
    await db.delete(importedProjectsTable).where(inArray(importedProjectsTable.importBatchId, batchIds));
    await db.delete(projectImportBatchesTable).where(inArray(projectImportBatchesTable.id, batchIds));
  });

  const unauthenticated = await fetch(`http://127.0.0.1:${port}/invoices/summary`);
  assert.equal(unauthenticated.status, 401);

  const response = await fetch(`http://127.0.0.1:${port}/invoices/summary`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    invoicedRevenue: 375,
    invoicedExpenses: 50,
    acceptedClientQuoteValue: 1000,
    upcomingClientPayments: 625,
  });

  const projectsResponse = await fetch(`http://127.0.0.1:${port}/projects`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(projectsResponse.status, 200);
  const projects = await projectsResponse.json() as Array<{ id: string; progress: number }>;
  assert.equal(projects.find((project) => project.id === `project-a-${suffix}`)?.progress, 37.5);

  const invoiceListResponse = await fetch(`http://127.0.0.1:${port}/invoices`, {
    headers: { "x-test-user": ownerId },
  });
  const invoiceList = await invoiceListResponse.json() as Array<{ id: string }>;
  assert.equal(invoiceListResponse.status, 200);
  assert.equal(invoiceList.length, 3);
  assert.equal(invoiceList.some((invoice) => invoice.id === `invoice-b-${suffix}`), false);

  const quoteListResponse = await fetch(`http://127.0.0.1:${port}/vendor-quotes`, {
    headers: { "x-test-user": ownerId },
  });
  const quoteList = await quoteListResponse.json() as Array<{ id: string }>;
  assert.equal(quoteListResponse.status, 200);
  assert.deepEqual(quoteList.map((quote) => quote.id), [`quote-incoming-${suffix}`]);
  const outboundQuoteListResponse = await fetch(`http://127.0.0.1:${port}/vendor-quotes?direction=luminova_to_client`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(outboundQuoteListResponse.status, 200);
  assert.deepEqual(await outboundQuoteListResponse.json(), []);
  assert.equal((await fetch(`http://127.0.0.1:${port}/vendor-quotes/quote-b-${suffix}`, {
    headers: { "x-test-user": ownerId },
  })).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/vendor-quotes/quote-b-${suffix}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": ownerId },
    body: JSON.stringify({ status: "Declined" }),
  })).status, 404);

  const crossOwnerInvoice = await fetch(`http://127.0.0.1:${port}/invoices`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": ownerId },
    body: JSON.stringify({
      invoiceNumber: "CROSS-OWNER",
      projectId: `project-b-${suffix}`,
      vendor: "Other",
      amount: 10,
      date: "2026-09-04",
      lineItem: "Should fail",
    }),
  });
  assert.equal(crossOwnerInvoice.status, 404);

  const tradeResponse = await fetch(`http://127.0.0.1:${port}/trades/trade-a-${suffix}`, {
    headers: { "x-test-user": ownerId },
  });
  assert.equal(tradeResponse.status, 200);
  const trade = await tradeResponse.json() as { jobHistory: Array<{ projectName: string; amount: number }> };
  assert.deepEqual(trade.jobHistory, []);
  const tradeListResponse = await fetch(`http://127.0.0.1:${port}/trades`, {
    headers: { "x-test-user": ownerId },
  });
  const tradeList = await tradeListResponse.json() as Array<{ id: string; companyName: string }>;
  assert.deepEqual(tradeList.map((item) => item.id), [`trade-a-${suffix}`]);
  assert.equal(tradeList.some((item) => /luminova|weidner/i.test(item.companyName)), false);
  assert.equal((await fetch(`http://127.0.0.1:${port}/trades/trade-b-${suffix}`, {
    headers: { "x-test-user": ownerId },
  })).status, 404);
});