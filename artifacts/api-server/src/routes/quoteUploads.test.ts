import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { RequestQuoteUploadResponse, ExtractQuoteDraftResponse, ConfirmQuoteUploadResponse, GetVendorQuoteResponse } from "@workspace/api-zod";
import { db, importedProjectsTable, importedVendorsTable, importedVendorQuotesTable, projectImportBatchesTable, projectDocumentsTable, quoteUploadReservationsTable } from "@workspace/db";
import { createQuoteUploadRouter, type QuoteUploadDependencies } from "./quoteUploads";
import luminovaRouter from "./luminova";
import storageRouter from "./storage";

test("quote uploads are immutable, workspace/project bound, retry-safe, and durably retained", async t => {
  const suffix = randomUUID(), owner = `quote-owner-${suffix}`, other = `quote-other-${suffix}`;
  const workspace = `quote-workspace-${suffix}`, projectId = `quote-project-${suffix}`, batchId = `quote-batch-${suffix}`;
  const vendorId = `quote-vendor-${suffix}`;
  const pdf = Buffer.from("%PDF-1.4\nPrivate vendor quote\n%%EOF");
  const objects = new Map<string, Buffer>();
  let extractionFailure = false, wrongClassification = false, unreadable = false;
  const storage: NonNullable<QuoteUploadDependencies["storage"]> = {
    writeQuoteUpload: async (id, bytes) => { objects.set(`/objects/quote-uploads/${id}`, Buffer.from(bytes)); },
    setAcl: async () => undefined,
    verifyConstructionDocument: async input => { if (objects.get(input.objectPath)?.length !== input.size) throw new Error("missing_source"); },
    getObjectEntityFile: async path => { if (!objects.has(path)) throw new Error("missing_source"); return { name: path } as never; },
    downloadObject: async file => new Response(new Uint8Array(objects.get(file.name)!)),
    deleteObject: async path => { objects.delete(path); },
  };
  await db.insert(projectImportBatchesTable).values({ id: batchId, projectId, ownerId: owner, workspaceId: workspace, status: "completed", manifest: [] });
  await db.insert(importedProjectsTable).values({ id: projectId, importBatchId: batchId, ownerId: owner, workspaceId: workspace,
    data: { id: projectId, name: "Quote upload test", address: "", region: "", status: "Active", progress: 0, pmName: "", clientName: "", startDate: "2026-01-01", targetDate: "2027-01-01", budgeted: 0, invoiced: 0, exteriorImage: "", description: "", budgetLineItems: [], clientQuote: { total: 0, revision: "", portions: [] } } });
  await db.insert(importedVendorsTable).values({ id: vendorId, importBatchId: batchId, ownerId: owner,
    data: { id: vendorId, companyName: "Glass Vendor", contactName: "", tradeType: "Glass", region: "", rating: 0, reviewCount: 0, completedJobs: 0, initials: "GV", accent: "#64748B" } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user") || owner, orgId = req.header("x-test-workspace") || workspace;
    const auth = Object.assign(() => ({ userId, orgId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
    Object.assign(req, { userId, auth, log: { warn: () => undefined, error: () => undefined } });
    next();
  });
  const dependencies: QuoteUploadDependencies = {
    role: async req => req.userId === "field-user" ? "Field Team" : "Admin",
    vendors: async () => [{ id: vendorId, companyName: "Glass Vendor", tradeType: "Glass" }],
    storage,
    enrich: async documents => documents.map(document => ({ ...document, textSnippet: unreadable ? "" : "A readable quote", extractionFailed: unreadable })),
    analyze: async () => {
      if (extractionFailure) throw new Error("provider_failed");
      return { classification: wrongClassification ? "other" : "vendor_quote", vendorName: "Glass Vendor", quoteNumber: "AI-1", trade: "Glazing", issueDate: null, dueDate: null, notes: "Scope", documentTotal: 1099, lineItems: [{ description: "Glass panels", quantity: 1, unitPrice: 1000 }] };
    },
  };
  app.use(createQuoteUploadRouter(dependencies));
  app.use(storageRouter);
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.close();
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.importBatchId, batchId));
    await db.delete(importedVendorQuotesTable).where(eq(importedVendorQuotesTable.importBatchId, batchId));
    await db.delete(importedVendorsTable).where(eq(importedVendorsTable.importBatchId, batchId));
    await db.delete(quoteUploadReservationsTable).where(eq(quoteUploadReservationsTable.projectId, projectId));
    await db.delete(importedProjectsTable).where(eq(importedProjectsTable.id, projectId));
    await db.delete(projectImportBatchesTable).where(eq(projectImportBatchesTable.id, batchId));
  });
  const request = (path: string, method = "GET", body?: unknown, user = owner, scope = workspace) => fetch(`${base}${path}`, {
    method, headers: { "x-test-user": user, "x-test-workspace": scope, "Content-Type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json" },
    ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
  });
  const metadata = { projectId, name: "quote.pdf", size: pdf.length, contentType: "application/pdf" };
  const reserve = async () => {
    const response = await request("/vendor-quote-uploads", "POST", metadata);
    assert.equal(response.status, 201, await response.clone().text());
    return RequestQuoteUploadResponse.parse(await response.json()).id;
  };
  assert.equal((await request("/vendor-quote-uploads", "POST", metadata, "field-user")).status, 403);
  assert.equal((await request("/vendor-quote-uploads", "POST", metadata, other)).status, 404);
  assert.equal((await request("/vendor-quote-uploads", "POST", { ...metadata, size: 16 * 1024 * 1024 })).status, 400);
  assert.equal((await request("/vendor-quote-uploads", "POST", { ...metadata, contentType: "text/html" })).status, 400);
  const id = await reserve(), path = `/vendor-quote-uploads/${id}`;
  assert.equal((await request(`${path}/draft`, "POST")).status, 400);
  assert.equal((await request(`${path}/content`, "PUT", pdf, owner, `${workspace}-other`)).status, 404);
  assert.equal((await request(`${path}/content`, "PUT", Buffer.alloc(pdf.length))).status, 400);
  assert.equal((await request(`${path}/content`, "PUT", pdf)).status, 204);
  assert.equal((await request(`${path}/content`, "PUT", pdf)).status, 409);
  const draftResponse = await request(`${path}/draft`, "POST");
  assert.equal(draftResponse.status, 200);
  const draft = ExtractQuoteDraftResponse.parse(await draftResponse.json());
  assert.equal(draft.vendorId, vendorId);
  assert.equal(draft.issueDate, null);
  assert.equal(draft.documentTotal, 1099);
  assert.equal(draft.lineItems[0].unitPrice, 10);
  assert.equal((await db.select().from(importedVendorQuotesTable).where(eq(importedVendorQuotesTable.importBatchId, batchId))).length, 0);
  extractionFailure = true;
  assert.equal((await request(`${path}/draft`, "POST")).status, 422);
  assert.equal(objects.size, 1);
  unreadable = true;
  assert.equal((await request(`${path}/draft`, "POST")).status, 422);
  assert.equal(objects.size, 1);
  unreadable = false;
  extractionFailure = false; wrongClassification = true;
  assert.equal((await request(`${path}/draft`, "POST")).status, 422);
  const input = { projectId, vendorId, quoteNumber: "REVIEWED-1", direction: "company_to_luminova", trade: "Reviewed glazing", status: "Received", revision: 1, issueDate: "2026-10-01", dueDate: "2026-10-31", notes: "Reviewed scope", lineItems: [{ description: "Corrected panels", quantity: 1.5, unitPrice: 10.01 }] };
  assert.equal((await request(`${path}/confirm`, "POST", { ...input, projectId: "wrong-project" })).status, 400);
  assert.equal((await request(`${path}/confirm`, "POST", { ...input, issueDate: "2026-02-30" })).status, 400);
  assert.equal((await request(`${path}/confirm`, "POST", { ...input, vendorId: "foreign-vendor" })).status, 400);
  assert.equal((await request(`${path}/confirm`, "POST", input, other)).status, 404);
  const [first, retry] = await Promise.all([request(`${path}/confirm`, "POST", input), request(`${path}/confirm`, "POST", input)]);
  assert.equal(first.status, 201, await first.clone().text());
  assert.equal(retry.status, 201, await retry.clone().text());
  const quote = ConfirmQuoteUploadResponse.parse(await first.json());
  assert.equal(ConfirmQuoteUploadResponse.parse(await retry.json()).id, quote.id);
  assert.equal(quote.total, 15.02);
  assert.equal(quote.trade, "Reviewed glazing");
  assert.equal((await request(`${path}/confirm`, "POST", { ...input, notes: "changed" })).status, 409);
  assert.equal((await request(path, "DELETE")).status, 409);
  assert.equal((await request(quote.attachments[0].url.replace(/^\/api/, ""))).status, 200);
  assert.equal((await request(quote.attachments[0].url.replace(/^\/api/, ""), "GET", undefined, owner, "foreign-workspace")).status, 404);
  assert.equal((await request(`/storage/objects/quote-uploads/${id}`)).status, 404);
  assert.equal((await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.importBatchId, batchId))).length, 1);
  assert.equal((await db.select().from(importedVendorQuotesTable).where(eq(importedVendorQuotesTable.importBatchId, batchId))).length, 1);
  // Recreate the router to prove the original and retry identity do not live in process memory.
  const freshApp = express(); freshApp.use(express.json());
  freshApp.use((req, _res, next) => {
    Object.assign(req, { userId: owner, auth: Object.assign(() => ({ userId: owner, orgId: workspace, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true }), log: { warn: () => undefined } }); next();
  });
  freshApp.use(createQuoteUploadRouter(dependencies));
  freshApp.use(luminovaRouter);
  const fresh = freshApp.listen(0);
  await new Promise<void>(resolve => fresh.once("listening", resolve));
  t.after(() => { fresh.close(); });
  const freshBase = `http://127.0.0.1:${(fresh.address() as AddressInfo).port}`;
  const reopened = await fetch(`${freshBase}/vendor-quotes/${quote.id}`);
  assert.equal(reopened.status, 200, await reopened.clone().text());
  assert.equal(GetVendorQuoteResponse.parse(await reopened.json()).attachments[0].url, quote.attachments[0].url);
  // Unknown directory vendors are never created by extraction or confirmation.
  const edited = await fetch(`${freshBase}/vendor-quotes/${quote.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trade: "Custom reviewed trade", notes: "After reload", lineItems: [{ description: "Exact half-cent", quantity: 1.5, unitPrice: 0.29 }] }) });
  assert.equal(edited.status, 200, await edited.clone().text());
  const updated = GetVendorQuoteResponse.parse(await edited.json());
  assert.equal(updated.trade, "Custom reviewed trade");
  assert.equal(updated.notes, "After reload");
  assert.equal(updated.attachments.length, 1);
  assert.equal(updated.total, 0.44);
  const moved = await fetch(`${freshBase}/vendor-quotes/${quote.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "different" }) });
  assert.equal(moved.status, 400);
  const cancelledId = await reserve();
  assert.equal((await request(`/vendor-quote-uploads/${cancelledId}`, "DELETE")).status, 204);
  assert.equal((await request(`/vendor-quote-uploads/${cancelledId}/content`, "PUT", pdf)).status, 409);
  const expiredId = await reserve();
  await db.update(quoteUploadReservationsTable).set({ expiresAt: new Date(0) }).where(eq(quoteUploadReservationsTable.id, expiredId));
  assert.equal((await request(`/vendor-quote-uploads/${expiredId}/content`, "PUT", pdf)).status, 409);
  assert.equal(objects.size, 1);
  const raceId = await reserve();
  const racePath = `/vendor-quote-uploads/${raceId}`;
  assert.equal((await request(`${racePath}/content`, "PUT", pdf)).status, 204);
  const [saveRace, cancelRace] = await Promise.all([
    request(`${racePath}/confirm`, "POST", input), request(racePath, "DELETE"),
  ]);
  const [raced] = await db.select().from(quoteUploadReservationsTable).where(eq(quoteUploadReservationsTable.id, raceId));
  if (saveRace.status === 201) {
    assert.equal(cancelRace.status, 409);
    assert.equal(raced.state, "attached");
    assert.ok(objects.has(raced.objectPath));
  } else {
    assert.equal(saveRace.status, 400);
    assert.equal(cancelRace.status, 204);
    assert.equal(raced.state, "cancelled");
    assert.ok(!objects.has(raced.objectPath));
  }
});
