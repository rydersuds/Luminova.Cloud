import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, importedProjectsTable, importedInvoicesTable, projectDocumentsTable,
  invoiceUploadReservationsTable,
} from "@workspace/db";
import {
  CreateInvoiceBody, CreateInvoiceResponse, GetInvoiceProjectsResponse,
  GetInvoiceSubmissionsResponse, RequestInvoiceUploadBody, RequestInvoiceUploadResponse,
} from "@workspace/api-zod";
import type { InvoiceInput, Invoice } from "@workspace/api-zod";
import { getRequestWorkspaceRole } from "./users";
import { ObjectStorageService } from "../lib/objectStorage";
import { remainingTradeBudgets, purchaseApproval, type CostCategory, type PurchaseRecord } from "../lib/invoiceBudget";

type Actor = { id: string; workspaceId: string; role: "Admin" | "Project Manager" };
type ProjectData = {
  id: string; name: string; projectManagerId?: string | null; budgetLineItems?: CostCategory[];
};
type ProjectRow = typeof importedProjectsTable.$inferSelect;
type StoredInvoice = Invoice & { submissionFingerprint?: string };
type AuthRequest = Request & { userId?: string };
type Storage = Pick<ObjectStorageService, "getObjectEntityUploadURL" | "normalizeObjectEntityPath" |
  "verifyConstructionDocument" | "setAcl" | "getObjectEntityFile" | "canRead" | "downloadObject">;
export type InvoiceSubmissionDependencies = {
  storage?: Storage;
  role?: (req: AuthRequest) => Promise<string | null>;
};
class InvoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function accessible(project: ProjectRow, actor: Actor) {
  const data = project.data as ProjectData;
  return project.workspaceId === actor.workspaceId && (
    actor.role === "Admin" || data.projectManagerId === actor.id || project.ownerId === actor.id
  );
}

export function createInvoiceSubmissionRouter(dependencies: InvoiceSubmissionDependencies = {}) {
  const router = Router();
  const storage = dependencies.storage ?? new ObjectStorageService();
  const roleFor = dependencies.role ?? getRequestWorkspaceRole;
  const actorFor = async (req: AuthRequest): Promise<Actor> => {
    if (!req.userId) throw new InvoiceError(401, "Authentication required");
    const role = await roleFor(req);
    if (role !== "Admin" && role !== "Project Manager") throw new InvoiceError(403, "Project management access required");
    return { id: req.userId, role, workspaceId: getAuth(req).orgId || "default" };
  };
  const projectsFor = async (actor: Actor) =>
    (await db.select().from(importedProjectsTable).where(eq(importedProjectsTable.workspaceId, actor.workspaceId)))
      .filter(project => accessible(project, actor));
  const projectFor = async (actor: Actor, projectId: string) => {
    const [project] = await db.select().from(importedProjectsTable)
      .where(and(eq(importedProjectsTable.id, projectId), eq(importedProjectsTable.workspaceId, actor.workspaceId))).limit(1);
    if (!project || !accessible(project, actor)) throw new InvoiceError(404, "Project not accessible");
    return project;
  };
  const safe = (handler: (req: AuthRequest, res: Response) => Promise<void>) =>
    async (req: AuthRequest, res: Response) => {
      try { await handler(req, res); }
      catch (error) {
        const status = error instanceof InvoiceError ? error.status : 500;
        if (status === 500) req.log?.error({ err: error }, "Invoice submission request failed");
        if (res.headersSent || res.destroyed) {
          if (!res.destroyed) res.destroy();
          return;
        }
        res.status(status).json({ error: error instanceof InvoiceError ? error.message : "The invoice request could not be completed. Please retry." });
      }
    };

  router.get("/invoice-projects", safe(async (req, res) => {
    const actor = await actorFor(req);
    const projects = await projectsFor(actor);
    const records = projects.length ? await db.select().from(importedInvoicesTable)
      .where(inArray(importedInvoicesTable.importBatchId, projects.map(project => project.importBatchId))) : [];
    res.json(GetInvoiceProjectsResponse.parse(projects.map(project => {
      const data = project.data as ProjectData;
      const invoices = records.filter(record => record.ownerId === project.ownerId &&
        record.importBatchId === project.importBatchId && (record.data as Invoice).projectId === project.id);
      return { id: project.id, name: data.name, categories: remainingTradeBudgets(data.budgetLineItems ?? [], invoices.map(record => record.data as PurchaseRecord)) };
    })));
  }));

  router.post("/invoice-uploads", safe(async (req, res) => {
    const actor = await actorFor(req);
    const parsed = RequestInvoiceUploadBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.name.trim()) throw new InvoiceError(400, "Choose a PDF, JPEG, PNG, or WebP invoice up to 20 MB.");
    const project = await projectFor(actor, parsed.data.projectId);
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    await db.insert(invoiceUploadReservationsTable).values({
      ...parsed.data, objectPath, ownerId: actor.id, workspaceId: actor.workspaceId,
      projectId: project.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    res.json(RequestInvoiceUploadResponse.parse({ uploadURL, objectPath }));
  }));

  router.get("/invoice-submissions", safe(async (req, res) => {
    const actor = await actorFor(req);
    const projects = await projectsFor(actor);
    const projectMap = new Map(projects.map(project => [project.id, project]));
    const records = projects.length ? await db.select().from(importedInvoicesTable)
      .where(inArray(importedInvoicesTable.importBatchId, projects.map(project => project.importBatchId)))
      .orderBy(desc(importedInvoicesTable.createdAt)) : [];
    const invoices = records.filter(record => {
      const invoice = record.data as Invoice;
      const project = projectMap.get(invoice.projectId);
      return invoice.submittedById && project && record.ownerId === project.ownerId && record.importBatchId === project.importBatchId;
    }).map(record => record.data);
    res.json(GetInvoiceSubmissionsResponse.parse(invoices));
  }));

  router.post("/invoices", safe(async (req, res) => {
    const actor = await actorFor(req);
    const parsed = CreateInvoiceBody.safeParse(req.body);
    if (!parsed.success) throw new InvoiceError(400, "Enter valid invoice details, a positive amount, and an uploaded invoice file.");
    const input: InvoiceInput = parsed.data;
    input.invoiceNumber = input.invoiceNumber.trim();
    input.vendor = input.vendor.trim();
    input.lineItem = input.lineItem.trim();
    const date = new Date(`${input.date}T00:00:00Z`);
    if (!input.invoiceNumber || !input.vendor || !input.lineItem ||
      Math.abs(Math.round(input.amount * 100) / 100 - input.amount) > 0.00000001 ||
      !Number.isFinite(input.amount) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) {
      throw new InvoiceError(400, "Use a valid calendar date and an amount with no more than two decimal places.");
    }
    const project = await projectFor(actor, input.projectId);
    const id = `purchase-${input.submissionId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify([
      input.projectId, input.invoiceNumber, input.vendor, input.amount, input.date, input.lineItem,
      input.budgetLineItemId, input.attachment.objectPath, input.attachment.name, input.attachment.size, input.attachment.contentType,
    ])).digest("hex");
    const [prior] = await db.select().from(importedInvoicesTable).where(eq(importedInvoicesTable.id, id)).limit(1);
    if (prior) {
      const invoice = prior.data as StoredInvoice;
      if (prior.ownerId !== project.ownerId || prior.importBatchId !== project.importBatchId ||
        invoice.submittedById !== actor.id || invoice.submissionFingerprint !== fingerprint) {
        throw new InvoiceError(409, "This submission ID was already used. Retry the original submission without editing its details.");
      }
      res.status(201).json(CreateInvoiceResponse.parse(invoice));
      return;
    }
    const reservationFor = (reservation: typeof invoiceUploadReservationsTable.$inferSelect | undefined) => {
      if (!reservation || reservation.ownerId !== actor.id || reservation.workspaceId !== actor.workspaceId ||
        reservation.projectId !== project.id || reservation.name !== input.attachment.name ||
        reservation.size !== input.attachment.size || reservation.contentType !== input.attachment.contentType ||
        reservation.attachedInvoiceId || reservation.expiresAt.getTime() <= Date.now()) {
        throw new InvoiceError(400, "The invoice upload is missing, expired, already attached, or does not match this project and file.");
      }
    };
    const [reservation] = await db.select().from(invoiceUploadReservationsTable)
      .where(eq(invoiceUploadReservationsTable.objectPath, input.attachment.objectPath)).limit(1);
    reservationFor(reservation);
    try { await storage.verifyConstructionDocument(input.attachment); }
    catch { throw new InvoiceError(400, "The uploaded invoice is incomplete or its file metadata does not match. Upload it again."); }
    // Owner-only ACL; assigned PMs and other admins download through the scoped feature endpoint.
    await storage.setAcl(input.attachment.objectPath, { owner: project.ownerId, visibility: "private" });

    const invoice = await db.transaction(async tx => {
      const [locked] = await tx.select().from(importedProjectsTable)
        .where(eq(importedProjectsTable.id, project.id)).for("update");
      if (!locked || !accessible(locked, actor)) throw new InvoiceError(404, "Project not accessible");
      // Reconcile a concurrent retry after the project lock has serialized submissions.
      const [existing] = await tx.select().from(importedInvoicesTable).where(eq(importedInvoicesTable.id, id));
      if (existing) {
        const data = existing.data as StoredInvoice;
        if (data.submittedById !== actor.id || data.submissionFingerprint !== fingerprint ||
          existing.importBatchId !== locked.importBatchId || existing.ownerId !== locked.ownerId) {
          throw new InvoiceError(409, "This submission ID was already used.");
        }
        return data;
      }
      const [reserved] = await tx.select().from(invoiceUploadReservationsTable)
        .where(eq(invoiceUploadReservationsTable.objectPath, input.attachment.objectPath)).for("update");
      reservationFor(reserved);
      const records = await tx.select().from(importedInvoicesTable)
        .where(and(eq(importedInvoicesTable.importBatchId, locked.importBatchId), eq(importedInvoicesTable.ownerId, locked.ownerId)));
      const costs = records.map(record => record.data as StoredInvoice).filter(record => record.projectId === locked.id);
      if (costs.some(record => record.direction !== "luminova_to_client" &&
        record.invoiceNumber?.trim().toLowerCase() === input.invoiceNumber.toLowerCase() &&
        record.vendor?.trim().toLowerCase() === input.vendor.toLowerCase())) {
        throw new InvoiceError(409, "An invoice with this vendor and invoice number already exists for the project.");
      }
      const data = locked.data as ProjectData;
      const categories = remainingTradeBudgets(data.budgetLineItems ?? [], costs);
      const category = categories.find(category => category.id === input.budgetLineItemId);
      if (input.budgetLineItemId !== null && !category) throw new InvoiceError(400, "Select a budget category belonging to this project.");
      const record: StoredInvoice = {
        id, invoiceNumber: input.invoiceNumber, projectId: locked.id, projectName: data.name,
        vendor: input.vendor, amount: input.amount, date: input.date, direction: "company_to_luminova",
        lineItem: category ? `${category.code} · ${category.description}` : input.lineItem,
        budgetLineItemId: category?.id ?? null, submittedById: actor.id, submissionFingerprint: fingerprint,
        ...purchaseApproval(category, input.amount),
        attachment: { ...input.attachment, url: `/api/invoice-submissions/${encodeURIComponent(id)}/file` },
      };
      await tx.insert(importedInvoicesTable).values({
        id, importBatchId: locked.importBatchId, ownerId: locked.ownerId, data: record,
      });
      await tx.insert(projectDocumentsTable).values({
        id: `document-${id}`, importBatchId: locked.importBatchId, projectId: locked.id,
        ownerId: locked.ownerId, objectPath: input.attachment.objectPath,
        name: input.attachment.name, relativePath: `Submitted invoices/${id}/${input.attachment.name.replace(/[\\/]/g, "_")}`,
        contentType: input.attachment.contentType, size: input.attachment.size,
        classification: "invoice", linkedEntityType: "invoice", linkedEntityId: id,
      });
      await tx.update(invoiceUploadReservationsTable).set({ attachedInvoiceId: id })
        .where(eq(invoiceUploadReservationsTable.objectPath, input.attachment.objectPath));
      return record;
    });
    res.status(201).json(CreateInvoiceResponse.parse(invoice));
  }));

  router.get("/invoice-submissions/:invoiceId/file", safe(async (req, res) => {
    const actor = await actorFor(req);
    const [record] = await db.select().from(importedInvoicesTable).where(eq(importedInvoicesTable.id, String(req.params.invoiceId))).limit(1);
    const invoice = record?.data as StoredInvoice | undefined;
    if (!record || !invoice?.attachment || !invoice.submittedById) throw new InvoiceError(404, "Invoice not accessible");
    const project = await projectFor(actor, invoice.projectId);
    if (record.importBatchId !== project.importBatchId || record.ownerId !== project.ownerId) throw new InvoiceError(404, "Invoice not accessible");
    const [document] = await db.select().from(projectDocumentsTable).where(and(
      eq(projectDocumentsTable.projectId, project.id), eq(projectDocumentsTable.importBatchId, project.importBatchId),
      eq(projectDocumentsTable.ownerId, project.ownerId), eq(projectDocumentsTable.linkedEntityId, record.id),
      eq(projectDocumentsTable.objectPath, invoice.attachment.objectPath),
    )).limit(1);
    if (!document) throw new InvoiceError(404, "Invoice file not accessible");
    const file = await storage.getObjectEntityFile(document.objectPath);
    if (!await storage.canRead(project.ownerId, file, actor.workspaceId)) throw new InvoiceError(403, "Invoice file not accessible");
    const response = await storage.downloadObject(file);
    res.setHeader("Content-Type", document.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`);
    if (!response.body) { res.end(); return; }
    await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), res);
  }));
  return router;
}

export default createInvoiceSubmissionRouter();