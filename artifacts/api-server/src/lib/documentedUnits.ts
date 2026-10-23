import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import type { DocumentedUnitReview, DocumentedUnitCandidate } from "@workspace/api-zod";
import type { UnitBudgetProject } from "./unitTradeBudgets";
import { extractImageText } from "./financialDocumentExtraction";
import { createProjectImportAiClient } from "./projectImportAnalysis";
import type { ObjectStorageService } from "./objectStorage";

export const unitLabelKey = (label: string) => label.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function suiteRegisterVersion(project: UnitBudgetProject, batchId: string) {
  return createHash("sha256").update(JSON.stringify([batchId, project.budgetUnits ?? [], project.unitBudget ?? null])).digest("hex");
}
type Source = { id: string; relativePath: string; name: string; objectPath: string; size: number; contentType: string };
export type UnitPage = { documentId: string; sourcePath: string; page: number; text: string; method: "text" | "ocr" };
export const isUnitRevisionSource = (document: Source) =>
  /\.pdf$/i.test(document.name) && /rebuild|rebuildrev/i.test(document.relativePath) &&
  !/drawings?|roof replacement/i.test(document.relativePath);

const bedroomKey = (value: string) => value.toLowerCase().replace(/(\d)\s*[- ]?\s*(?:bedrooms?|beds?|br)\b/g, "$1 bedroom").trim();
const typeExpression = /\b(?:[1-9]\s*[- ]?\s*(?:bedrooms?|beds?|br)|studio|micro[- ]?suite)\b/gi;
// Labels require an explicit suite/unit cue. Ranges are deliberately not expanded.
const label = "(?:[A-Za-z]{1,4}[- ]?)?\\d{1,6}(?:-[A-Za-z0-9]{1,6}|[A-Za-z])?";
const mentions = new RegExp(`\\b(?:units?|suites?|apartments?)\\s*(?:numbers?\\s*|nos?\\.?\\s*|#\\s*|:\\s*)?(${label}(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+(?:and|&)\\s+)${label})*)`, "gi");

export function reviewUnitPages(pages: UnitPage[], project: UnitBudgetProject, sources: DocumentedUnitReview["sources"], initialWarnings: string[] = []): DocumentedUnitReview {
  const candidates = new Map<string, DocumentedUnitCandidate>();
  const mappings = new Map<string, Set<string>>();
  const sourceLabels = new Map<string, Set<string>>();
  const warnings = new Set(initialWarnings);
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    for (const [lineIndex, line] of lines.entries()) {
      // Corporate addresses and financial/specification tables are not project suites.
      if (/\b(?:avenue|ave|street|drive|road|boulevard|calgary|kirkland|prepared for|prepared by|quantity|qty|each|rate|model|price|common area|shared area|summary|count)\b|\$|\b\d{4}-\d{2}-\d{2}\b/i.test(line)) continue;
      const addressContext = lines.slice(Math.max(0, lineIndex - 1), lineIndex + 2).join(" ");
      if (/\b(?:drive|avenue|street|boulevard|postal|kirkland|calgary)\b/i.test(addressContext) && !/\b(?:floor plan|scope|residential)\b/i.test(line)) continue;
      for (const match of line.matchAll(mentions)) {
        const tail = line.slice(match.index! + match[0].length);
        if (/^\s*(?:bedrooms?|beds?|br|bathrooms?|storeys?|amps?|watts?|volts?|mm|inches?|feet|sqft|%|[$€£])/i.test(tail)) continue;
        const typeSuffix = /^\s*[-–—]\s*[1-9]\s*[- ]?\s*(?:bedrooms?|beds?|br)\b/i.test(tail);
        if (!typeSuffix && /^\s*(?:[-–—]\s*\d|to\s+\d|\/\d|\.\d|\s+(?:units?|sqft|weeks?|days?|dollars?|per|of\s+\d)\b)/i.test(tail)) {
          warnings.add("Numeric ranges or quantities were excluded; review the source for individually documented labels.");
          continue;
        }
        const labels = match[1].split(/\s*,\s*(?:and\s+)?|\s+(?:and|&)\s+/i);
        const typeMentions = [...line.matchAll(typeExpression)].map(m => bedroomKey(m[0]));
        for (const value of labels) {
          if (/^\d+-\d+$/.test(value)) { warnings.add("Numeric ranges were excluded, not expanded into suites."); continue; }
          if (!new RegExp(`^${label}$`, "i").test(value) || /^(?:19|20)\d{2}$/.test(value)) continue;
          const key = unitLabelKey(value);
          if (candidates.size >= 500 && !candidates.has(key)) {
            warnings.add("The 500-candidate review limit was reached."); continue;
          }
          const candidate = candidates.get(key) ?? { label: value, unitTypeId: null, uncertain: false, evidence: [] };
          candidate.uncertain ||= page.method === "ocr" || /\b(?:possible|maybe|unconfirmed|proposed|tentative|removed|deleted|excluded|superseded)\b/i.test(line);
          if (!candidate.evidence.some(e => e.documentId === page.documentId && e.page === page.page && e.text === line.trim()) && candidate.evidence.length < 24) {
            candidate.evidence.push({ documentId: page.documentId, sourcePath: page.sourcePath, page: page.page, text: line.trim().slice(0, 1000), method: page.method });
          }
          if (typeMentions.length) {
            const types = mappings.get(key) ?? new Set<string>();
            typeMentions.forEach(type => types.add(type)); mappings.set(key, types);
          }
          const listed = sourceLabels.get(page.documentId) ?? new Set<string>();
          listed.add(key); sourceLabels.set(page.documentId, listed);
          candidates.set(key, candidate);
        }
      }
    }
  }
  const lists = [...sourceLabels.values()].map(set => [...set].sort().join("|"));
  const revisionDifference = new Set(lists).size > 1;
  if (revisionDifference) warnings.add("Documents mention different unit sets. No revision has been preferred; compare source evidence before selecting.");
  for (const [key, candidate] of candidates) {
    const types = mappings.get(key);
    const supported = types?.size === 1
      ? project.unitBudget?.unitTypes.filter(type => bedroomKey(type.name) === [...types][0]) ?? [] : [];
    candidate.unitTypeId = supported.length === 1 ? supported[0].id : null;
    if (types && types.size > 1) {
      candidate.uncertain = true;
      warnings.add(`Suite ${candidate.label} has conflicting dwelling-type evidence. Choose a type only after reviewing the revisions.`);
    }
    candidate.uncertain ||= revisionDifference;
  }
  if ([...candidates.values()].some(c => !c.unitTypeId)) warnings.add("Some labels have no supported dwelling-type mapping. They remain unassigned and have no suite allowance until you choose a source-budget type.");
  for (const type of project.unitBudget?.unitTypes ?? []) {
    if ([...candidates.values()].filter(c => c.unitTypeId === type.id).length > type.unitCount) warnings.add(`${type.name} candidates exceed the source budget's ${type.unitCount} units.`);
  }
  const expected = project.unitBudget?.unitTypes.reduce((sum, type) => sum + type.unitCount, 0);
  if (expected !== undefined && expected !== candidates.size) warnings.add(`${candidates.size} documented labels found; the source budget counts ${expected} units. Counts do not establish identifiers or completeness.`);
  warnings.add("This is a candidate review, not a verified complete project unit list. Image-only content, tables, or unsupported label formats may require manual review.");
  return { candidates: [...candidates.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), sources, warnings: [...warnings], complete: false };
}

type Storage = Pick<ObjectStorageService, "getObjectEntityFile" | "downloadObject">;
export async function extractStoredUnitReview(documents: Source[], project: UnitBudgetProject, storage: Storage): Promise<DocumentedUnitReview> {
  const eligible = documents.filter(isUnitRevisionSource).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const sources: DocumentedUnitReview["sources"] = [];
  const pages: UnitPage[] = [];
  const warnings: string[] = [];
  let totalBytes = 0, textCharacters = 0, ocrPages = 0, ocrBytes = 0;
  if (!eligible.length) warnings.push("No stored rebuild PDF revisions were found. Saved suites have not changed.");
  for (const [index, document] of eligible.entries()) {
    const source: DocumentedUnitReview["sources"][number] = { documentId: document.id, sourcePath: document.relativePath, pagesRead: 0, pageCount: 0, status: "unavailable" };
    sources.push(source);
    if (index >= 6 || document.size > 15 * 1024 * 1024 || totalBytes + document.size > 60 * 1024 * 1024) {
      warnings.push(`${document.relativePath}: skipped at the document/byte review limit.`); continue;
    }
    let parser: PDFParse | undefined;
    try {
      const response = await storage.downloadObject(await storage.getObjectEntityFile(document.objectPath));
      if (!response.ok || !response.body) throw new Error("Source unavailable");
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          totalBytes += chunk.value.length;
          if (bytes > 15 * 1024 * 1024 || totalBytes > 60 * 1024 * 1024) throw new Error("Source exceeds limit");
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel(); }
      parser = new PDFParse({ data: Buffer.concat(chunks) });
      source.pageCount = (await parser.getInfo()).total;
      source.status = "reviewed";
      for (let page = 1; page <= Math.min(source.pageCount, 60); page++) {
        if (textCharacters >= 300_000) { source.status = "partial"; break; }
        let text = (await parser.getText({ partial: [page] })).pages[0]?.text ?? "";
        let method: "text" | "ocr" = "text";
        if (text.trim().length < 80) {
          source.status = "partial";
          if (ocrPages < 8) {
            ocrPages++;
            try {
              const screenshot = await parser.getScreenshot({ partial: [page], desiredWidth: 1600, imageBuffer: true, imageDataUrl: false });
              const image = screenshot.pages[0]?.data;
              if (image && image.length <= 8 * 1024 * 1024 && ocrBytes + image.length <= 12 * 1024 * 1024) {
                ocrBytes += image.length;
                text = await extractImageText(createProjectImportAiClient().withOptions({ timeout: 45_000, maxRetries: 0 }), document, [{ buffer: Buffer.from(image), contentType: "image/png", pageNumber: page }]);
                method = "ocr";
              }
            } catch { warnings.push(`${document.relativePath}, page ${page}: OCR unavailable; review is incomplete.`); }
          }
        }
        const bounded = text.slice(0, 300_000 - textCharacters);
        if (bounded.length !== text.length) source.status = "partial";
        textCharacters += bounded.length;
        pages.push({ documentId: document.id, sourcePath: document.relativePath, page, text: bounded, method });
        source.pagesRead++;
      }
      if (source.pagesRead < source.pageCount) source.status = "partial";
    } catch {
      source.status = source.pagesRead ? "partial" : "unavailable";
      warnings.push(`${document.relativePath}: missing or unreadable source; saved suites and budgets are unchanged.`);
    } finally { await parser?.destroy(); }
  }
  if (sources.some(source => source.status !== "reviewed")) warnings.push("Not all document content was reviewed. Review limits: 6 PDFs, 60 pages each, 60 MB total, 300,000 characters and up to 8 OCR pages / 12 MB rendered images.");
  return reviewUnitPages(pages, project, sources, warnings);
}
