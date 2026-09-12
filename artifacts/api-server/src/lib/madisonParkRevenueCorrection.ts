import { and, eq } from "drizzle-orm";
import {
  db,
  importedInvoicesTable,
  importedProjectsTable,
  projectDocumentsTable,
} from "@workspace/db";
import { enrichFinancialDocumentSnippets } from "./financialDocumentExtraction";

export const MADISON_PARK_REVENUE_CORRECTION_KEY = "madison-park-rebuild-revenue-2026-06-18";
export const MADISON_PARK_REVENUE_AMOUNT = 942715.84;
export const MADISON_PARK_REVENUE_DATE = "2026-06-18";
const MADISON_PARK_PROJECT_ID = "madison-park-building-79-1788749816036";

type MadisonProject = {
  id: string;
  name?: string;
  address?: string;
  clientName?: string;
  invoiced?: number;
  clientQuote?: {
    total: number;
    revision: string;
    portions: Array<{ code: string; label: string; amount: number }>;
  };
  progress?: number;
  revenueAdjustments?: Array<{
    key: string;
    amount: number;
    sourceDocumentId: string;
    sourcePath: string;
  }>;
  [key: string]: unknown;
};

type MadisonDocument = {
  id: string;
  projectId: string | null;
  ownerId: string;
  relativePath: string;
  name: string;
  objectPath: string;
  contentType: string;
  size: number;
  classification: string;
  textSnippet: string | null;
};

type CorrectionLog = {
  warn: (context: object, message: string) => void;
};

type RevenueCorrectionHooks = {
  beforeProjectUpdate?: () => void | Promise<void>;
};

export type MadisonParkRevenueSource = {
  documentId: string;
  sourcePath: string;
  amount: number;
  date: string;
  issuer: string;
  recipient: string;
  evidence: string;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const parseDate = (text: string) => {
  const match = text.match(
    /revised\s*:?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
  );
  if (!match) return "";
  const month = new Date(`${match[1]} 1, 2000`).getMonth() + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
};

const parseClientProposal = (document: MadisonDocument): MadisonParkRevenueSource | null => {
  const text = document.textSnippet?.trim() ?? "";
  if (!text) return null;
  const normalized = text.toLocaleLowerCase();
  const isMadisonScope = /madison park|79 cambridge/.test(normalized);
  const hasIssuer = /luminova construction/.test(normalized);
  const hasRecipient = /weidner (investment services|apartment homes|investement services)/.test(normalized);
  const totalMatch = text.match(
    /grand\s+total\s+including(?:\s+all\s+applicable)?\s+taxes\s+\$?\s*([\d,]+\.\d{2})/i,
  );
  if (!isMadisonScope || !hasIssuer || !hasRecipient || !totalMatch) return null;

  const amount = Number(totalMatch[1].replace(/,/g, ""));
  if (amount !== MADISON_PARK_REVENUE_AMOUNT) return null;
  const date = parseDate(text);
  if (date !== MADISON_PARK_REVENUE_DATE) return null;

  return {
    documentId: document.id,
    sourcePath: document.relativePath,
    amount,
    date,
    issuer: "Luminova Construction",
    recipient: "Weidner Investment Services, Inc.",
    evidence: totalMatch[0].replace(/\s+/g, " ").trim(),
  };
};

const sourcePreference = (source: MadisonParkRevenueSource) =>
  Number(/incl taxes/i.test(source.sourcePath)) * 3 +
  Number(/rebuildrev1/i.test(source.sourcePath)) * 2 +
  Number(/\.pdf$/i.test(source.sourcePath));

export const findMadisonParkRevenueSource = (
  documents: MadisonDocument[],
): MadisonParkRevenueSource | null => {
  const matches = documents
    .map(parseClientProposal)
    .filter((source): source is MadisonParkRevenueSource => Boolean(source))
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      sourcePreference(b) - sourcePreference(a) ||
      a.sourcePath.localeCompare(b.sourcePath),
    );
  return matches[0] ?? null;
};

const isMadisonParkProject = (project: MadisonProject) => {
  if (project.id === MADISON_PARK_PROJECT_ID) return true;
  const name = (project.name ?? "").toLocaleLowerCase();
  const address = (project.address ?? "").toLocaleLowerCase();
  return name.includes("madison park") && address.includes("79 cambridge");
};

const correctionInvoiceId = (ownerId: string) =>
  `revenue-adjustment-${ownerId}-${MADISON_PARK_REVENUE_CORRECTION_KEY}`;

const importedInvoiceForCorrection = (
  project: MadisonProject,
  source: MadisonParkRevenueSource,
  ownerId: string,
) => ({
  id: correctionInvoiceId(ownerId),
  invoiceNumber: "MADISON-PARK-REV-2026-06-18",
  projectId: project.id,
  projectName: project.name ?? "Madison Park Building 79",
  vendor: project.clientName ?? "Weidner Investment Services, Inc.",
  direction: "luminova_to_client" as const,
  amount: source.amount,
  date: source.date,
  status: "Sent",
  lineItem: "Madison Park abatement/change-order revenue adjustment",
  overage: 0,
  correctionKey: MADISON_PARK_REVENUE_CORRECTION_KEY,
  sourceDocumentId: source.documentId,
  sourceDocumentPath: source.sourcePath,
  sourceDocumentEvidence: {
    amount: source.amount,
    date: source.date,
    issuer: source.issuer,
    recipient: source.recipient,
    text: source.evidence,
  },
});

export async function applyMadisonParkRevenueCorrection(
  ownerId: string,
  log?: CorrectionLog,
  hooks?: RevenueCorrectionHooks,
) {
  const projectRows = await db.select({ data: importedProjectsTable.data })
    .from(importedProjectsTable)
    .where(eq(importedProjectsTable.ownerId, ownerId));
  const projectRow = projectRows.find((row) => isMadisonParkProject(row.data as MadisonProject));
  if (!projectRow) return { applied: false, alreadyApplied: false, source: null };
  const project = projectRow.data as MadisonProject;
  const [existingCorrection] = await db.select({ id: importedInvoicesTable.id })
    .from(importedInvoicesTable)
    .where(and(
      eq(importedInvoicesTable.id, correctionInvoiceId(ownerId)),
      eq(importedInvoicesTable.ownerId, ownerId),
    ))
    .limit(1);
  const projectAlreadyUpdated = project.revenueAdjustments?.some(
    (adjustment) => adjustment.key === MADISON_PARK_REVENUE_CORRECTION_KEY,
  ) ?? false;
  if (existingCorrection && projectAlreadyUpdated) {
    return { applied: false, alreadyApplied: true, source: null };
  }

  const documents = await db.select().from(projectDocumentsTable).where(and(
    eq(projectDocumentsTable.ownerId, ownerId),
    eq(projectDocumentsTable.projectId, project.id),
  ));
  const financialCandidates = documents.filter((document) =>
    /(\.pdf|\.xlsx|\.docx|\.odt)$/i.test(document.name) &&
    /(quote|proposal|rebuild|abatement|contract)/i.test(document.relativePath) &&
    !/(drawing|drawings|truss|elevation|section view)/i.test(document.relativePath),
  );
  const extractionCandidates = financialCandidates.map((document) => ({
    objectPath: document.objectPath,
    relativePath: document.relativePath,
    name: document.name,
    size: document.size,
    contentType: document.contentType,
    textSnippet: document.textSnippet ?? undefined,
  }));
  const enriched = await enrichFinancialDocumentSnippets(extractionCandidates, log ?? {
    warn: () => undefined,
  });
  const enrichedDocuments = enriched.map((document, index) => ({
    ...financialCandidates[index],
    textSnippet: document.textSnippet ?? null,
  }));
  const source = findMadisonParkRevenueSource(enrichedDocuments);
  if (!source) {
    log?.warn({ ownerId, projectId: project.id }, "Madison Park revenue source was not found");
    return { applied: false, alreadyApplied: false, source: null };
  }

  const enrichedSource = enrichedDocuments.find((document) => document.id === source.documentId);
  const sourceDocument = documents.find((document) => document.id === source.documentId);
  if (!sourceDocument) throw new Error("Madison Park revenue source document disappeared before correction");

  return db.transaction(async (tx) => {
    const [lockedProjectRow] = await tx.select({ data: importedProjectsTable.data })
      .from(importedProjectsTable)
      .where(and(eq(importedProjectsTable.id, project.id), eq(importedProjectsTable.ownerId, ownerId)))
      .for("update");
    if (!lockedProjectRow) throw new Error("Owned Madison Park project disappeared before correction");

    const lockedProject = lockedProjectRow.data as MadisonProject;
    const adjustmentApplied = lockedProject.revenueAdjustments?.some(
      (adjustment) => adjustment.key === MADISON_PARK_REVENUE_CORRECTION_KEY,
    ) ?? false;
    const [savedInvoice] = await tx.select({ id: importedInvoicesTable.id })
      .from(importedInvoicesTable)
      .where(and(
        eq(importedInvoicesTable.id, correctionInvoiceId(ownerId)),
        eq(importedInvoicesTable.ownerId, ownerId),
      ))
      .limit(1);

    let invoiceInserted = false;
    if (!savedInvoice) {
      const invoice = importedInvoiceForCorrection(lockedProject, source, ownerId);
      await tx.insert(importedInvoicesTable).values({
        id: invoice.id,
        importBatchId: sourceDocument.importBatchId,
        ownerId,
        data: invoice,
      });
      invoiceInserted = true;
    }

    let projectUpdated = false;
    if (!adjustmentApplied) {
      await hooks?.beforeProjectUpdate?.();
      const currentRevenue = typeof lockedProject.invoiced === "number" ? lockedProject.invoiced : 0;
      const updatedProject: MadisonProject = {
        ...lockedProject,
        invoiced: roundCurrency(currentRevenue + source.amount),
        progress: lockedProject.clientQuote?.total
          ? Math.round(Math.min(Math.max((currentRevenue + source.amount) / lockedProject.clientQuote.total, 0), 1) * 1000) / 10
          : lockedProject.progress,
        revenueAdjustments: [
          ...(lockedProject.revenueAdjustments ?? []),
          {
            key: MADISON_PARK_REVENUE_CORRECTION_KEY,
            amount: source.amount,
            sourceDocumentId: source.documentId,
            sourcePath: source.sourcePath,
          },
        ],
      };
      const updatedRows = await tx.update(importedProjectsTable)
        .set({ data: updatedProject })
        .where(and(eq(importedProjectsTable.id, lockedProject.id), eq(importedProjectsTable.ownerId, ownerId)))
        .returning({ id: importedProjectsTable.id });
      if (updatedRows.length !== 1) throw new Error("Madison Park revenue project update was not persisted");
      projectUpdated = true;
    }

    if (enrichedSource?.textSnippet) {
      await tx.update(projectDocumentsTable)
        .set({ textSnippet: enrichedSource.textSnippet })
        .where(and(
          eq(projectDocumentsTable.id, source.documentId),
          eq(projectDocumentsTable.ownerId, ownerId),
        ));
    }

    return {
      applied: invoiceInserted || projectUpdated,
      alreadyApplied: !invoiceInserted && !projectUpdated,
      source,
    };
  });
}