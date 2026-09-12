import { and, eq, sql } from "drizzle-orm";
import { db, projectDocumentsTable } from "@workspace/db";

const STANDARD_ENTRY_AGREEMENT_TITLE =
  "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS";

export const isStandardEntryAgreementName = (name: string): boolean => {
  const title = name.replace(/\.[^./]+$/, "").trim();
  return title.toLocaleUpperCase() === STANDARD_ENTRY_AGREEMENT_TITLE;
};

export type EntryAgreementCandidate = {
  relativePath: string;
  name: string;
  textSnippet?: string | null;
};

const normalizedEvidence = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const entryAgreementConfidence = (
  document: EntryAgreementCandidate,
): number => {
  if (isStandardEntryAgreementName(document.name)) return 100;

  const path = normalizedEvidence(document.relativePath);
  const text = normalizedEvidence(document.textSnippet ?? "");
  const has = (source: string, expression: RegExp) => expression.test(source);

  if (
    has(text, /\bnotice of authorized contractor\b/) &&
    has(text, /\binsurance access\b/)
  )
    return 98;

  const accessWording =
    /\b(site|job ?site|premises|property|schedule)\b.{0,40}\b(entry|access)\b|\b(entry|access)\b.{0,40}\b(site|job ?site|premises|property|schedule)\b/;
  const agreementWording =
    /\b(agreement|authorization|authorisation|notice|acknowledg(e)?ment|consent)\b/;
  const supportingWording =
    /\b(insurance|insured|contractor|subcontractor|schedule|appointment)\b/;

  if (
    has(text, accessWording) &&
    has(text, agreementWording) &&
    has(text, supportingWording)
  ) {
    return 92;
  }

  const explicitPathWording =
    /\b(site|job ?site|schedule)\b.{0,30}\b(entry|access)\b.{0,30}\b(agreement|authorization|authorisation|notice)\b|\b(entry|access)\b.{0,30}\b(site|job ?site|schedule)\b.{0,30}\b(agreement|authorization|authorisation|notice)\b/;
  if (has(path, explicitPathWording)) return 86;

  return 0;
};

export const selectEntryAgreementRelativePath = (
  documents: EntryAgreementCandidate[],
): string | null => {
  const ranked = documents
    .map((document) => ({
      relativePath: document.relativePath,
      confidence: entryAgreementConfidence(document),
    }))
    .filter((candidate) => candidate.confidence >= 85)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.relativePath.localeCompare(right.relativePath),
    );

  if (!ranked.length) return null;
  if (ranked[1]?.confidence === ranked[0].confidence) return null;
  return ranked[0].relativePath;
};

export const backfillLegacyEntryAgreementDesignations =
  async (): Promise<number> => {
    const updated = await db
      .update(projectDocumentsTable)
      .set({ isEntryAgreement: true })
      .where(
        and(
          eq(projectDocumentsTable.classification, "contract"),
          eq(projectDocumentsTable.isEntryAgreement, false),
          sql`upper(trim(regexp_replace(${projectDocumentsTable.name}, '\\.[^./]+$', ''))) = ${STANDARD_ENTRY_AGREEMENT_TITLE}`,
        ),
      )
      .returning({ id: projectDocumentsTable.id });

    return updated.length;
  };
