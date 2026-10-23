import express, { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, lt, ne } from "drizzle-orm";
import { db, importedProjectsTable, importedVendorQuotesTable, projectDocumentsTable, quoteUploadReservationsTable as reservations } from "@workspace/db";
import { RequestQuoteUploadBody, RequestQuoteUploadResponse, ConfirmQuoteUploadBody, ConfirmQuoteUploadResponse, ExtractQuoteDraftResponse } from "@workspace/api-zod";
import { getRequestWorkspaceRole } from "./users";
import { ObjectStorageService } from "../lib/objectStorage";
import { enrichFinancialDocumentSnippets } from "../lib/financialDocumentExtraction";
import { classifyProjectImportAnalysisError } from "../lib/projectImportAnalysis";
import { analyzeQuoteText, resolveQuoteDraft, verifyQuoteBytes } from "../lib/quoteDraft";
import { isValidCalendarDate } from "../lib/projectProgress";

type Req = Request & { userId?: string };
type Vendor = { id: string; companyName: string; tradeType: string };
export function quoteAwareDocumentUrl(document: { objectPath: string; linkedEntityId: string | null }) {
  return document.objectPath.startsWith("/objects/quote-uploads/") && document.linkedEntityId
    ? `/api/vendor-quotes/${encodeURIComponent(document.linkedEntityId)}/source`
    : `/api/storage${document.objectPath}`;
}
export type QuoteUploadDependencies = {
  vendors: (ownerId: string, workspaceId: string) => Promise<Vendor[]>;
  role?: typeof getRequestWorkspaceRole;
  storage?: Pick<ObjectStorageService, "writeQuoteUpload" | "setAcl" | "verifyConstructionDocument" | "getObjectEntityFile" | "downloadObject" | "deleteObject">;
  enrich?: typeof enrichFinancialDocumentSnippets;
  analyze?: typeof analyzeQuoteText;
};
class QuoteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createQuoteUploadRouter(deps: QuoteUploadDependencies) {
  const router = Router();
  const storage = deps.storage ?? new ObjectStorageService();
  const actor = async (req: Req) => {
    if (!req.userId) throw new QuoteError(401, "Authentication required");
    const role = await (deps.role ?? getRequestWorkspaceRole)(req);
    if (role !== "Admin" && role !== "Project Manager") throw new QuoteError(403, "Project management access required");
    return { id: req.userId, workspaceId: getAuth(req).orgId || "default" };
  };
  const projectFor = async (a: Awaited<ReturnType<typeof actor>>, id: string) => {
    const [row] = await db.select().from(importedProjectsTable).where(and(
      eq(importedProjectsTable.id, id), eq(importedProjectsTable.workspaceId, a.workspaceId),
      eq(importedProjectsTable.ownerId, a.id),
    ));
    if (!row || row.archivedAt) throw new QuoteError(404, "Project not accessible");
    return row;
  };
  const slotFor = async (req: Req) => {
    const a = await actor(req);
    const [slot] = await db.select().from(reservations).where(and(
      eq(reservations.id, String(req.params.uploadId)), eq(reservations.ownerId, a.id),
      eq(reservations.workspaceId, a.workspaceId),
    ));
    if (!slot) throw new QuoteError(404, "Upload not found");
    const project = await projectFor(a, slot.projectId);
    return { a, slot, project };
  };
  const usable = (slot: typeof reservations.$inferSelect) => {
    if (slot.state !== "uploaded" || slot.expiresAt.getTime() <= Date.now()) throw new QuoteError(400, "Upload is incomplete, cancelled, expired, or already attached.");
  };
  const safe = (fn: (req: Req, res: Response) => Promise<void>) => async (req: Req, res: Response) => {
    try { await fn(req, res); }
    catch (error) {
      const status = error instanceof QuoteError ? error.status : 500;
      if (status === 500) req.log?.warn({ ...classifyProjectImportAnalysisError(error) }, "Vendor quote request failed");
      if (res.headersSent) { res.destroy(); return; }
      res.status(status).json({ error: error instanceof QuoteError ? error.message : "The quote request failed. Your entered details are preserved; retry or continue manually." });
    }
  };

  router.post("/vendor-quote-uploads", safe(async (req, res) => {
    const a = await actor(req);
    const parsed = RequestQuoteUploadBody.safeParse(req.body);
    if (!parsed.success) throw new QuoteError(400, "Choose a PDF up to 15 MB or JPEG, PNG, WebP up to 8 MB.");
    const input = parsed.data;
    await projectFor(a, input.projectId);
    if (!input.name.trim() || (input.contentType !== "application/pdf" && input.size > 8 * 1024 * 1024))
      throw new QuoteError(400, "Choose a PDF up to 15 MB or JPEG, PNG, WebP up to 8 MB.");
    // Expired, unclaimed slots are locked before cleanup, just like explicit cancellation.
    const expired = await db.select().from(reservations).where(and(
      eq(reservations.ownerId, a.id), eq(reservations.workspaceId, a.workspaceId),
      lt(reservations.expiresAt, new Date()), ne(reservations.state, "attached"),
    )).limit(10);
    for (const slot of expired) await db.transaction(async tx => {
      const [locked] = await tx.select().from(reservations).where(eq(reservations.id, slot.id)).for("update");
      if (!locked || locked.state === "attached") return;
      try { await storage.deleteObject(locked.objectPath); }
      catch { return; }
      await tx.update(reservations).set({ state: "cancelled" }).where(eq(reservations.id, slot.id));
    });
    const id = randomUUID();
    await db.insert(reservations).values({ ...input, id, objectPath: `/objects/quote-uploads/${id}`, ownerId: a.id, workspaceId: a.workspaceId, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) });
    res.status(201).json(RequestQuoteUploadResponse.parse({ id }));
  }));

  router.put("/vendor-quote-uploads/:uploadId/content", express.raw({ type: "application/octet-stream", limit: "15mb" }), safe(async (req, res) => {
    const { slot } = await slotFor(req);
    if (!Buffer.isBuffer(req.body)) throw new QuoteError(400, "Upload the original document bytes.");
    try { verifyQuoteBytes(req.body, slot); }
    catch { throw new QuoteError(400, "File content, size, or format does not match. Choose PDF (15 MB) or JPEG, PNG, WebP (8 MB)."); }
    await db.transaction(async tx => {
      const [locked] = await tx.select().from(reservations).where(eq(reservations.id, slot.id)).for("update");
      if (!locked || locked.state !== "pending" || locked.expiresAt.getTime() <= Date.now()) throw new QuoteError(409, "This upload is no longer writable. Choose the document again.");
      // No signed PUT URL is exposed: bytes cannot be changed after verification.
      await storage.writeQuoteUpload(slot.id, req.body, slot.contentType);
      await storage.setAcl(slot.objectPath, { owner: slot.ownerId, visibility: "private" });
      await tx.update(reservations).set({ state: "uploaded" }).where(eq(reservations.id, slot.id));
    });
    res.sendStatus(204);
  }));

  router.post("/vendor-quote-uploads/:uploadId/draft", safe(async (req, res) => {
    const { a, slot } = await slotFor(req);
    usable(slot);
    const log = { warn: (context: object, message: string) => {
      const { relativePath: _path, ...safeContext } = context as { relativePath?: string };
      req.log?.warn(safeContext, message);
    } };
    const [document] = await (deps.enrich ?? enrichFinancialDocumentSnippets)([{ ...slot, relativePath: "Vendor quote.pdf" }], log);
    if (!document.textSnippet || document.extractionFailed) throw new QuoteError(422, "The document could not be read. The uploaded source is retained; enter details manually or retry analysis.");
    try {
      const analysis = await (deps.analyze ?? analyzeQuoteText)(document.textSnippet);
      if (analysis.classification !== "vendor_quote") throw new QuoteError(422, "This is not clearly a vendor quote to Luminova. Verify the document or continue with manual entry.");
      res.json(ExtractQuoteDraftResponse.parse(resolveQuoteDraft(analysis, await deps.vendors(a.id, a.workspaceId))));
    } catch (error) {
      if (error instanceof QuoteError) throw error;
      req.log?.warn(classifyProjectImportAnalysisError(error), "Quote draft analysis unavailable");
      throw new QuoteError(422, "AI analysis is unavailable. Your source is retained; retry analysis or enter details manually.");
    }
  }));

  router.delete("/vendor-quote-uploads/:uploadId", safe(async (req, res) => {
    const { slot } = await slotFor(req);
    await db.transaction(async tx => {
      const [locked] = await tx.select().from(reservations).where(eq(reservations.id, slot.id)).for("update");
      if (!locked || locked.state === "attached") throw new QuoteError(409, "Attached sources cannot be cancelled.");
      await storage.deleteObject(locked.objectPath);
      await tx.update(reservations).set({ state: "cancelled" }).where(eq(reservations.id, slot.id));
    });
    res.sendStatus(204);
  }));

  router.post("/vendor-quote-uploads/:uploadId/confirm", safe(async (req, res) => {
    const { a, slot, project } = await slotFor(req);
    const parsed = ConfirmQuoteUploadBody.safeParse(req.body);
    if (!parsed.success) throw new QuoteError(400, "Complete all quote details and line items.");
    const input = parsed.data;
    if (input.projectId !== slot.projectId || input.direction !== "company_to_luminova" ||
      !isValidCalendarDate(input.issueDate) || !isValidCalendarDate(input.dueDate) || input.dueDate < input.issueDate ||
      !input.trade.trim() || !input.quoteNumber.trim() ||
      input.lineItems.some(line => !line.description.trim() ||
        Math.abs(Math.round(line.unitPrice * 100) / 100 - line.unitPrice) > 0.00000001 ||
        !Number.isSafeInteger(Math.round(line.quantity * Math.round(line.unitPrice * 100)))))
      throw new QuoteError(400, "Review project, dates, trade, and prices (up to two decimal places).");
    const vendor = (await deps.vendors(a.id, a.workspaceId)).find(v => v.id === input.vendorId);
    if (!vendor) throw new QuoteError(400, "Select a vendor in this workspace's directory.");
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const result = await db.transaction(async tx => {
      const [lockedProject] = await tx.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, project.id)).for("update");
      if (!lockedProject || lockedProject.archivedAt || lockedProject.workspaceId !== a.workspaceId || lockedProject.ownerId !== a.id) throw new QuoteError(404, "Project not accessible");
      const [locked] = await tx.select().from(reservations).where(eq(reservations.id, slot.id)).for("update");
      if (locked.state === "attached") {
        if (locked.fingerprint !== fingerprint) throw new QuoteError(409, "This upload was already saved. Reopen its quote to edit it.");
        const [prior] = await tx.select().from(importedVendorQuotesTable).where(eq(importedVendorQuotesTable.id, locked.attachedQuoteId!));
        return prior.data;
      }
      usable(locked);
      await storage.verifyConstructionDocument(slot);
      const id = `uploaded-quote-${slot.id}`;
      const now = new Date().toISOString();
      const lineItems = input.lineItems.map((line, i) => ({ ...line, id: line.id || `${id}-${i}`, amount: Math.round(line.quantity * Math.round(line.unitPrice * 100)) / 100 }));
      const attachment = { id: `document-${id}`, name: slot.name, relativePath: `Uploaded quotes/${slot.id}/${slot.name.replace(/[\\/]/g, "_")}`, url: `/api/vendor-quotes/${id}/source`, contentType: slot.contentType, size: slot.size };
      const quote = { ...input, id, ownerId: a.id, reviewedUpload: true, projectName: (project.data as { name: string }).name, vendorName: vendor.companyName, lineItems, total: lineItems.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) / 100, attachments: [attachment], createdAt: now, updatedAt: now };
      if (!Number.isSafeInteger(Math.round(quote.total * 100))) throw new QuoteError(400, "Quote total is too large.");
      await tx.insert(importedVendorQuotesTable).values({ id, ownerId: project.ownerId, importBatchId: project.importBatchId, data: quote });
      await tx.insert(projectDocumentsTable).values({ ...attachment, objectPath: slot.objectPath, importBatchId: project.importBatchId, projectId: project.id, ownerId: project.ownerId, classification: "quote", linkedEntityType: "quote", linkedEntityId: id });
      await tx.update(reservations).set({ state: "attached", attachedQuoteId: id, fingerprint }).where(eq(reservations.id, slot.id));
      return quote;
    });
    res.status(201).json(ConfirmQuoteUploadResponse.parse(result));
  }));

  router.get("/vendor-quotes/:quoteId/source", safe(async (req, res) => {
    const a = await actor(req);
    const [slot] = await db.select().from(reservations).where(and(
      eq(reservations.attachedQuoteId, String(req.params.quoteId)), eq(reservations.workspaceId, a.workspaceId),
    ));
    if (!slot) throw new QuoteError(404, "Source not found");
    await projectFor(a, slot.projectId);
    const response = await storage.downloadObject(await storage.getObjectEntityFile(slot.objectPath));
    res.setHeader("Content-Type", slot.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!response.body) throw new QuoteError(404, "Source unavailable");
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  }));
  return router;
}
