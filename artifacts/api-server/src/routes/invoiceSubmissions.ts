import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, importedProjectsTable, importedInvoicesTable, projectDocumentsTable,
  invoiceUploadReservationsTable, purchaseApprovalsTable, type PurchaseApprovalRow,
} from "@workspace/db";
import {
  CreateInvoiceBody, CreateInvoiceResponse, GetInvoiceProjectsResponse,
  GetInvoiceSubmissionsResponse, RequestInvoiceUploadBody, RequestInvoiceUploadResponse,
  CreatePurchaseApprovalBody, CreatePurchaseApprovalResponse, DecidePurchaseApprovalBody,
  DecidePurchaseApprovalParams, DecidePurchaseApprovalResponse, GetPurchaseApprovalsResponse,
  UpdateProjectBudgetUnitsBody, UpdateProjectBudgetUnitsParams, UpdateProjectBudgetUnitsResponse,
} from "@workspace/api-zod";
import type { InvoiceInput, Invoice } from "@workspace/api-zod";
import { getRequestWorkspaceRole, workspaceUserDisplayName } from "./users";
import { ObjectStorageService } from "../lib/objectStorage";
import { extractWorkbookInternalBudget } from "../lib/financialDocumentExtraction";
import {
  commitmentRecords,
  externalAuthorizationDecision,
  purchaseApproval,
  type CostCategory,
  type PurchaseRecord,
} from "../lib/invoiceBudget";
import { emailApprovalNotifier, type ApprovalEmailFacts, type ApprovalNotifier } from "../lib/approvalNotifications";
import {
  suiteTradeBudgets, suiteBudgetExtras, validateBudgetUnits, scopePrefix, scopedTradeLabel,
  type UnitBudgetProject,
} from "../lib/unitTradeBudgets";

type Actor = { id: string; workspaceId: string; role: "Admin" | "Project Manager" };
type ProjectData = UnitBudgetProject & {
  id: string; name: string; projectManagerId?: string | null; budgetEnabled?: boolean; budgetLineItems?: CostCategory[];
  internalBudgetSource?: string;
};
type ProjectRow = typeof importedProjectsTable.$inferSelect;
type StoredInvoice = Invoice & { submissionFingerprint?: string };
type AuthRequest = Request & { userId?: string };
type Storage = Pick<ObjectStorageService, "getObjectEntityUploadURL" | "normalizeObjectEntityPath" |
  "verifyConstructionDocument" | "setAcl" | "getObjectEntityFile" | "canRead" | "downloadObject">;
export type InvoiceSubmissionDependencies = {
  storage?: Storage;
  role?: (req: AuthRequest) => Promise<string | null>;
  displayName?: (userId: string) => Promise<string>;
  notify?: ApprovalNotifier;
};

const PENDING = "Pending approval";
const cents = (value: number) => Math.round(value * 100);

/** Looks up a person's name for the approval record without letting a slow directory hold up the request. */
async function nameWithin(lookup: (userId: string) => Promise<string>, userId: string) {
  try {
    return await Promise.race([
      lookup(userId),
      new Promise<string>((resolve) => setTimeout(() => resolve("Team member"), 2000)),
    ]);
  } catch {
    return "Team member";
  }
}

function serializeApproval(row: PurchaseApprovalRow, projectName: string) {
  return {
    id: row.id, projectId: row.projectId, projectName, kind: row.kind as "purchase" | "invoice",
    invoiceId: row.invoiceId, budgetLineItemId: row.budgetLineItemId, tradeLabel: row.tradeLabel,
    vendor: row.vendor, description: row.description, amount: row.amountCents / 100,
    remainingBefore: row.remainingBeforeCents === null ? null : row.remainingBeforeCents / 100,
    overage: row.overageCents / 100, status: row.status as "Auto-approved" | "Pending approval" | "Approved" | "Declined",
    approvalReason: row.approvalReason as "within_budget" | "over_budget" | "budget_unavailable",
    requestedById: row.requestedById, requestedByName: row.requestedByName, requestedAt: row.requestedAt.toISOString(),
    decidedByName: row.decidedByName, decidedAt: row.decidedAt?.toISOString() ?? null, decisionNote: row.decisionNote,
    budgetIncrease: row.budgetIncreaseCents === null ? null : row.budgetIncreaseCents / 100,
  };
}

const emailFacts = (approval: ReturnType<typeof serializeApproval>): ApprovalEmailFacts => approval;
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
  const displayName = dependencies.displayName ?? workspaceUserDisplayName;
  const notify = dependencies.notify ?? emailApprovalNotifier;
  /** Email is best effort and happens after the response: a mail outage never blocks an approval. */
  const notifyLater = (req: AuthRequest, event: Parameters<ApprovalNotifier>[1]) => {
    void notify(req, event).catch((error) => req.log?.warn?.({ err: error }, "Approval notification failed"));
  };
  const approvalsForProjects = async (projects: ProjectRow[]) => projects.length
    ? (await db.select().from(purchaseApprovalsTable).where(inArray(purchaseApprovalsTable.projectId, projects.map(project => project.id))))
        .filter(row => projects.some(project => project.id === row.projectId && project.importBatchId === row.importBatchId && project.ownerId === row.ownerId))
    : [];
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
    const approvals = await approvalsForProjects(projects);
    res.json(GetInvoiceProjectsResponse.parse(projects.map(project => {
      const data = project.data as ProjectData;
      const invoices = records.filter(record => record.ownerId === project.ownerId &&
        record.importBatchId === project.importBatchId && (record.data as Invoice).projectId === project.id);
      const commitments = commitmentRecords(approvals.filter(approval => approval.projectId === project.id));
      const budgetEnabled = data.budgetEnabled !== false;
      return {
        id: project.id,
        name: data.name,
        budgetEnabled,
        ...suiteBudgetExtras(data, [...invoices.map(record => record.data as PurchaseRecord), ...commitments]),
        categories: budgetEnabled
          ? suiteTradeBudgets(data, [...invoices.map(record => record.data as PurchaseRecord), ...commitments])
          : [],
      };
    })));
  }));

  router.patch("/projects/:projectId/budget-units", safe(async (req, res) => {
    const actor = await actorFor(req);
    const params = UpdateProjectBudgetUnitsParams.safeParse(req.params);
    const parsed = UpdateProjectBudgetUnitsBody.safeParse(req.body);
    if (!params.success || !parsed.success) throw new InvoiceError(400, "Enter valid suite labels and dwelling types.");
    const project = await projectFor(actor, params.data.projectId);
    const units = parsed.data.units.map(unit => ({ ...unit, label: unit.label.trim() }));
    const original = project.data as ProjectData;
    let recoveredBudget = original.unitBudget;
    // Older imports kept the detail but not the category subtotals. Recover only from
    // the project's original workbook, and only when every dwelling-type total agrees.
    if (original.unitBudget?.unitTypes.some(type => !type.categoryBudgets?.length) && original.internalBudgetSource) {
      const [document] = await db.select().from(projectDocumentsTable).where(and(
        eq(projectDocumentsTable.projectId, project.id), eq(projectDocumentsTable.importBatchId, project.importBatchId),
        eq(projectDocumentsTable.ownerId, project.ownerId), eq(projectDocumentsTable.relativePath, original.internalBudgetSource),
      )).limit(1);
      if (document && document.size <= 15 * 1024 * 1024 && /\.xlsx$/i.test(document.name)) {
        try {
          const file = await storage.getObjectEntityFile(document.objectPath);
          const response = await storage.downloadObject(file);
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Missing budget source");
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.length;
              if (size > 15 * 1024 * 1024) throw new Error("Budget source too large");
              chunks.push(chunk.value);
            }
          } finally { await reader.cancel(); }
          const source = (await extractWorkbookInternalBudget(Buffer.concat(chunks), document.relativePath))?.unitBudget;
          if (source && cents(source.total) === cents(original.unitBudget.total) &&
            source.unitTypes.length === original.unitBudget.unitTypes.length &&
            original.unitBudget.unitTypes.every(type => source.unitTypes.some(candidate =>
              candidate.name === type.name && candidate.unitCount === type.unitCount &&
              cents(candidate.perUnitTotal) === cents(type.perUnitTotal) && cents(candidate.total) === cents(type.total)))) {
            recoveredBudget = { ...original.unitBudget, unitTypes: original.unitBudget.unitTypes.map(type => ({
              ...type, categoryBudgets: source.unitTypes.find(candidate => candidate.name === type.name)!.categoryBudgets,
            })) };
          }
        } catch {
          req.log?.warn?.({ projectId: project.id }, "Source trade subtotals could not be verified; suite checks remain conservative");
        }
      }
    }
    await db.transaction(async tx => {
      const [locked] = await tx.select().from(importedProjectsTable)
        .where(eq(importedProjectsTable.id, project.id)).for("update");
      if (!locked || !accessible(locked, actor)) throw new InvoiceError(404, "Project not accessible");
      const data = locked.data as ProjectData;
      const validation = validateBudgetUnits(data, units);
      if (validation) throw new InvoiceError(400, validation);
      const approvals = await tx.select().from(purchaseApprovalsTable).where(and(
        eq(purchaseApprovalsTable.projectId, locked.id),
        eq(purchaseApprovalsTable.importBatchId, locked.importBatchId),
        eq(purchaseApprovalsTable.ownerId, locked.ownerId),
      ));
      const invoices = await tx.select().from(importedInvoicesTable).where(and(
        eq(importedInvoicesTable.importBatchId, locked.importBatchId), eq(importedInvoicesTable.ownerId, locked.ownerId),
      ));
      const identifiers = [
        ...approvals.map(row => row.budgetLineItemId),
        ...invoices.filter(row => (row.data as Invoice).projectId === locked.id).map(row => (row.data as Invoice).budgetLineItemId),
      ];
      for (const old of data.budgetUnits ?? []) {
        const replacement = units.find(unit => unit.id === old.id);
        if ((!replacement || replacement.unitTypeId !== old.unitTypeId) &&
          identifiers.some(id => id?.startsWith(scopePrefix(old.id)))) {
          throw new InvoiceError(409, `Suite ${old.label} has requests or invoices and cannot be removed or assigned another dwelling type.`);
        }
      }
      const sameSource = JSON.stringify(data.unitBudget) === JSON.stringify(original.unitBudget) &&
        data.internalBudgetSource === original.internalBudgetSource;
      await tx.update(importedProjectsTable).set({ data: {
        ...data, budgetUnits: units, ...(sameSource && recoveredBudget ? { unitBudget: recoveredBudget } : {}),
      } })
        .where(eq(importedProjectsTable.id, locked.id));
    });
    res.json(UpdateProjectBudgetUnitsResponse.parse({ units }));
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

    // Looked up before the project lock so a slow user directory never holds it.
    const requestedByName = await nameWithin(displayName, actor.id);
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
      const approvals = (await tx.select().from(purchaseApprovalsTable).where(and(
        eq(purchaseApprovalsTable.projectId, locked.id), eq(purchaseApprovalsTable.importBatchId, locked.importBatchId),
        eq(purchaseApprovalsTable.ownerId, locked.ownerId),
      )).for("update"));
      // An invoice for something already approved claims that purchase: its reservation turns into this cost.
      // Best match: same vendor first, then the smallest approved amount that covers the invoice, then the oldest.
      const sameVendor = (vendor: string | null) => (vendor ?? "").trim().toLowerCase() === input.vendor.toLowerCase();
      const budgetEnabled = data.budgetEnabled !== false;
      const preApproved = !budgetEnabled || input.budgetLineItemId === null ? undefined : approvals
        .filter(approval => approval.kind === "purchase" && !approval.invoiceId && approval.budgetLineItemId === input.budgetLineItemId &&
          (approval.status === "Auto-approved" || approval.status === "Approved") && approval.amountCents >= cents(input.amount))
        .sort((a, b) => Number(sameVendor(b.vendor)) - Number(sameVendor(a.vendor)) ||
          a.amountCents - b.amountCents || a.requestedAt.getTime() - b.requestedAt.getTime())[0];
      const commitments = commitmentRecords(approvals.filter(approval => approval.id !== preApproved?.id));
      const categories = budgetEnabled
        ? suiteTradeBudgets(data, [...costs, ...commitments])
        : [];
      const category = budgetEnabled ? categories.find(category => category.id === input.budgetLineItemId) : undefined;
      if (budgetEnabled && input.budgetLineItemId !== null && !category) throw new InvoiceError(400, "Select a budget category belonging to this project.");
      if (budgetEnabled && data.unitBudget && !category) throw new InvoiceError(400, "Select an individual suite or shared area and its trade.");
      const checked = budgetEnabled ? purchaseApproval(category, input.amount) : externalAuthorizationDecision();
      const decision = preApproved && checked.status === PENDING
        ? { ...checked, status: "Approved", approvalReason: "pre_approved" as const }
        : checked;
      const tradeLabel = category
        ? scopedTradeLabel(category)
        : budgetEnabled ? input.lineItem : "External authorization required";
      const approvalId = decision.status === PENDING ? `approval-${id}` : preApproved?.id ?? null;
      const record: StoredInvoice = {
        id, invoiceNumber: input.invoiceNumber, projectId: locked.id, projectName: data.name,
        vendor: input.vendor, amount: input.amount, date: input.date, direction: "company_to_luminova",
        lineItem: tradeLabel,
        budgetLineItemId: budgetEnabled ? category?.id ?? null : null, submittedById: actor.id, submissionFingerprint: fingerprint,
        ...decision, purchaseApprovalId: approvalId,
        attachment: { ...input.attachment, url: `/api/invoice-submissions/${encodeURIComponent(id)}/file` },
      };
      await tx.insert(importedInvoicesTable).values({
        id, importBatchId: locked.importBatchId, ownerId: locked.ownerId, data: record,
      });
      if (preApproved) {
        await tx.update(purchaseApprovalsTable).set({ invoiceId: id }).where(eq(purchaseApprovalsTable.id, preApproved.id));
      }
      if (decision.status === PENDING) {
        await tx.insert(purchaseApprovalsTable).values({
          id: approvalId!, workspaceId: actor.workspaceId, projectId: locked.id, importBatchId: locked.importBatchId,
          ownerId: locked.ownerId, kind: "invoice", invoiceId: id, budgetLineItemId: category?.id ?? null, tradeLabel,
          vendor: input.vendor, description: `Invoice ${input.invoiceNumber}`, amountCents: cents(input.amount),
          remainingBeforeCents: decision.budgetRemainingBefore === null ? null : cents(decision.budgetRemainingBefore),
          overageCents: cents(decision.overage), status: PENDING, approvalReason: decision.approvalReason,
          requestedById: actor.id, requestedByName,
        });
      }
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
    if (invoice.status === PENDING && invoice.approvalReason !== "external_authorization_required" && invoice.purchaseApprovalId) {
      const [row] = await db.select().from(purchaseApprovalsTable).where(eq(purchaseApprovalsTable.id, invoice.purchaseApprovalId)).limit(1);
      if (row) notifyLater(req, { type: "requested", approval: emailFacts(serializeApproval(row, invoice.projectName)) });
    }
  }));

  router.get("/purchase-approvals", safe(async (req, res) => {
    const actor = await actorFor(req);
    const projects = await projectsFor(actor);
    const names = new Map(projects.map(project => [project.id, (project.data as ProjectData).name]));
    const rows = (await approvalsForProjects(projects)).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    res.json(GetPurchaseApprovalsResponse.parse(rows.map(row => serializeApproval(row, names.get(row.projectId) ?? "Project"))));
  }));

  router.post("/purchase-approvals", safe(async (req, res) => {
    const actor = await actorFor(req);
    const parsed = CreatePurchaseApprovalBody.safeParse(req.body);
    const description = parsed.success ? parsed.data.description.trim() : "";
    if (!parsed.success || !description || Math.abs(Math.round(parsed.data.amount * 100) / 100 - parsed.data.amount) > 0.00000001) {
      throw new InvoiceError(400, "Choose a trade, enter an amount with no more than two decimal places, and say what the purchase is for.");
    }
    const input = parsed.data;
    const project = await projectFor(actor, input.projectId);
    const requestedByName = await nameWithin(displayName, actor.id);
    const created = await db.transaction(async tx => {
      const [locked] = await tx.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, project.id)).for("update");
      if (!locked || !accessible(locked, actor)) throw new InvoiceError(404, "Project not accessible");
      const data = locked.data as ProjectData;
      const invoices = await tx.select().from(importedInvoicesTable).where(and(eq(importedInvoicesTable.importBatchId, locked.importBatchId), eq(importedInvoicesTable.ownerId, locked.ownerId)));
      const approvals = await tx.select().from(purchaseApprovalsTable).where(and(eq(purchaseApprovalsTable.projectId, locked.id), eq(purchaseApprovalsTable.importBatchId, locked.importBatchId), eq(purchaseApprovalsTable.ownerId, locked.ownerId)));
      const costs = invoices.map(record => record.data as StoredInvoice).filter(record => record.projectId === locked.id);
      const budgetEnabled = data.budgetEnabled !== false;
      const categories = budgetEnabled
        ? suiteTradeBudgets(data, [...costs, ...commitmentRecords(approvals)])
        : [];
      const category = budgetEnabled ? categories.find(candidate => candidate.id === input.budgetLineItemId) : undefined;
      if (budgetEnabled && !category) throw new InvoiceError(400, "Select a trade from this project's budget.");
      const decision = budgetEnabled ? purchaseApproval(category, input.amount) : externalAuthorizationDecision();
      const tradeLabel = category ? scopedTradeLabel(category) : "External authorization required";
      const [row] = await tx.insert(purchaseApprovalsTable).values({
        id: `approval-${randomUUID()}`, workspaceId: actor.workspaceId, projectId: locked.id, importBatchId: locked.importBatchId,
        ownerId: locked.ownerId, kind: "purchase", invoiceId: null, budgetLineItemId: category?.id ?? null,
        tradeLabel, vendor: input.vendor?.trim() || null, description,
        amountCents: cents(input.amount),
        remainingBeforeCents: decision.budgetRemainingBefore === null ? null : cents(decision.budgetRemainingBefore),
        overageCents: cents(decision.overage), status: decision.status, approvalReason: decision.approvalReason,
        requestedById: actor.id, requestedByName,
      }).returning();
      return serializeApproval(row, data.name);
    });
    res.status(201).json(CreatePurchaseApprovalResponse.parse(created));
    if (created.status === PENDING && created.tradeLabel !== "External authorization required") {
      notifyLater(req, { type: "requested", approval: emailFacts(created) });
    }
  }));

  router.post("/purchase-approvals/:approvalId/decision", safe(async (req, res) => {
    const actor = await actorFor(req);
    if (actor.role !== "Admin") throw new InvoiceError(403, "Only an Admin can approve or decline over-budget spending.");
    const params = DecidePurchaseApprovalParams.safeParse(req.params);
    const parsed = DecidePurchaseApprovalBody.safeParse(req.body);
    if (!params.success || !parsed.success) throw new InvoiceError(400, "Choose approve or decline. Notes can be up to 500 characters.");
    const { decision, note, raiseBudget } = parsed.data;
    const [existing] = await db.select().from(purchaseApprovalsTable).where(eq(purchaseApprovalsTable.id, params.data.approvalId)).limit(1);
    if (!existing || existing.workspaceId !== actor.workspaceId) throw new InvoiceError(404, "Approval not found");
    const project = await projectFor(actor, existing.projectId);
    if (existing.importBatchId !== project.importBatchId || existing.ownerId !== project.ownerId) throw new InvoiceError(404, "Approval not found");
    const decidedByName = await nameWithin(displayName, actor.id);
    const decided = await db.transaction(async tx => {
      const [locked] = await tx.select().from(importedProjectsTable).where(eq(importedProjectsTable.id, project.id)).for("update");
      const [row] = await tx.select().from(purchaseApprovalsTable).where(eq(purchaseApprovalsTable.id, existing.id)).for("update");
      if (!locked || !row) throw new InvoiceError(404, "Approval not found");
      if (row.status !== PENDING) throw new InvoiceError(409, `This request was already ${row.status.toLowerCase()}.`);
      if (row.approvalReason === "external_authorization_required") {
        throw new InvoiceError(409, "This purchase requires external authorization and cannot be approved in the app.");
      }
      const approve = decision === "approve";
      let budgetIncreaseCents: number | null = null;
      if (approve && raiseBudget && row.budgetLineItemId && row.overageCents > 0) {
        if ((locked.data as ProjectData).unitBudget) {
          throw new InvoiceError(409, "Suite trade limits come from the dwelling-type source budget. Approve without changing that budget, or revise the source budget first.");
        }
        // A change order: add exactly the overage to the trade, so later purchases are measured against the new budget.
        const data = locked.data as ProjectData;
        const items = (data.budgetLineItems ?? []).map(item => item.id === row.budgetLineItemId && typeof item.budgeted === "number"
          ? { ...item, budgeted: (cents(item.budgeted) + row.overageCents) / 100 }
          : item);
        if (items.some(item => item.id === row.budgetLineItemId && typeof item.budgeted === "number")) {
          await tx.update(importedProjectsTable).set({ data: { ...data, budgetLineItems: items } }).where(eq(importedProjectsTable.id, locked.id));
          budgetIncreaseCents = row.overageCents;
        }
      }
      const [updated] = await tx.update(purchaseApprovalsTable).set({
        status: approve ? "Approved" : "Declined", decidedById: actor.id, decidedByName, decidedAt: new Date(),
        decisionNote: note?.trim() || null, budgetIncreaseCents,
      }).where(eq(purchaseApprovalsTable.id, row.id)).returning();
      if (row.kind === "invoice" && row.invoiceId) {
        const [invoiceRow] = await tx.select().from(importedInvoicesTable).where(eq(importedInvoicesTable.id, row.invoiceId)).for("update");
        if (invoiceRow) {
          await tx.update(importedInvoicesTable).set({ data: { ...(invoiceRow.data as StoredInvoice), status: approve ? "Approved" : "Declined" } })
            .where(eq(importedInvoicesTable.id, invoiceRow.id));
        }
      }
      return serializeApproval(updated, (locked.data as ProjectData).name);
    });
    res.json(DecidePurchaseApprovalResponse.parse(decided));
    notifyLater(req, { type: "decided", approval: emailFacts(decided) });
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