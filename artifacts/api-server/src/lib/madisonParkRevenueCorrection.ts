import { and, eq } from "drizzle-orm";
import {
  db,
  importedInvoicesTable,
  importedProjectsTable,
  importedVendorQuotesTable,
  projectDocumentsTable,
} from "@workspace/db";
import { enrichFinancialDocumentSnippets } from "./financialDocumentExtraction";

export const MADISON_PARK_REVENUE_CORRECTION_KEY = "madison-park-client-quote-2026-06-18";
export const MADISON_PARK_REVENUE_AMOUNT = 942715.84;
export const MADISON_PARK_CLIENT_QUOTE_TOTAL = 1388786.55;
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
  `revenue-adjustment-${ownerId}-madison-park-rebuild-revenue-2026-06-18`;

const correctionQuoteId = (ownerId: string) =>
  `client-quote-${ownerId}-${MADISON_PARK_REVENUE_CORRECTION_KEY}`;

const importedQuoteForCorrection = (
  project: MadisonProject,
  source: MadisonParkRevenueSource,
  ownerId: string,
) => ({
  id: correctionQuoteId(ownerId),
  quoteNumber: "MADISON-PARK-QUOTE-2026-06-18",
  projectId: project.id,
  projectName: project.name ?? "Madison Park Building 79",
  vendorId: "luminova-construction",
  vendorName: "Luminova Construction",
  direction: "luminova_to_client" as const,
  isProjectTotal: true,
  trade: "Client proposal",
  status: "Accepted",
  revision: 1,
  issueDate: source.date,
  dueDate: source.date,
  notes: "Canonical accepted client quote reconstructed from the revised proposal.",
  lineItems: [{
    id: "madison-park-project-total",
    description: "Madison Park Building 79 accepted project quote",
    quantity: 1,
    unitPrice: MADISON_PARK_CLIENT_QUOTE_TOTAL,
    amount: MADISON_PARK_CLIENT_QUOTE_TOTAL,
  }],
  total: MADISON_PARK_CLIENT_QUOTE_TOTAL,
  attachments: [],
  sourceRelativePaths: [source.sourcePath],
  importConfidence: 100,
  createdAt: `${source.date}T00:00:00.000Z`,
  updatedAt: `${source.date}T00:00:00.000Z`,
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
  const [existingCorrection] = await db.select({ id: importedVendorQuotesTable.id })
    .from(importedVendorQuotesTable)
    .where(and(
      eq(importedVendorQuotesTable.id, correctionQuoteId(ownerId)),
      eq(importedVendorQuotesTable.ownerId, ownerId),
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
    const [savedQuote] = await tx.select({ id: importedVendorQuotesTable.id })
      .from(importedVendorQuotesTable)
      .where(and(
        eq(importedVendorQuotesTable.id, correctionQuoteId(ownerId)),
        eq(importedVendorQuotesTable.ownerId, ownerId),
      ))
      .limit(1);

    let quoteInserted = false;
    if (!savedQuote) {
      const quote = importedQuoteForCorrection(lockedProject, source, ownerId);
      await tx.insert(importedVendorQuotesTable).values({
        id: quote.id,
        importBatchId: sourceDocument.importBatchId,
        ownerId,
        data: quote,
      });
      quoteInserted = true;
    }
    await tx.delete(importedInvoicesTable).where(and(
      eq(importedInvoicesTable.id, correctionInvoiceId(ownerId)),
      eq(importedInvoicesTable.ownerId, ownerId),
    ));

    let projectUpdated = false;
    if (!adjustmentApplied) {
      await hooks?.beforeProjectUpdate?.();
      const priorAdjustment = lockedProject.revenueAdjustments?.find(
        (adjustment) => adjustment.key === "madison-park-rebuild-revenue-2026-06-18",
      );
      const currentRevenue = roundCurrency(
        Math.max((typeof lockedProject.invoiced === "number" ? lockedProject.invoiced : 0) - (priorAdjustment?.amount ?? 0), 0),
      );
      const updatedProject: MadisonProject = {
        ...lockedProject,
        invoiced: currentRevenue,
        clientQuote: {
          total: MADISON_PARK_CLIENT_QUOTE_TOTAL,
          revision: "MADISON-PARK-QUOTE-2026-06-18",
          portions: [],
        },
        progress: Math.round(Math.min(currentRevenue / MADISON_PARK_CLIENT_QUOTE_TOTAL, 1) * 1000) / 10,
        revenueAdjustments: [
          ...(lockedProject.revenueAdjustments ?? []).filter((adjustment) =>
            adjustment.key !== "madison-park-rebuild-revenue-2026-06-18" &&
            adjustment.key !== MADISON_PARK_REVENUE_CORRECTION_KEY
          ),
          {
            key: MADISON_PARK_REVENUE_CORRECTION_KEY,
            amount: 0,
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
      applied: quoteInserted || projectUpdated,
      alreadyApplied: !quoteInserted && !projectUpdated,
      source,
    };
  });
}