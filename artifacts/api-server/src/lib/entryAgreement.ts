import { and, eq, sql } from "drizzle-orm";
import { db, projectDocumentsTable } from "@workspace/db";

const STANDARD_ENTRY_AGREEMENT_TITLE = "NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS";

export const isStandardEntryAgreementName = (name: string): boolean => {
  const title = name.replace(/\.[^./]+$/, "").trim();
  return title.toLocaleUpperCase() === STANDARD_ENTRY_AGREEMENT_TITLE;
};

export const backfillLegacyEntryAgreementDesignations = async (): Promise<number> => {
  const updated = await db
    .update(projectDocumentsTable)
    .set({ isEntryAgreement: true })
    .where(and(
      eq(projectDocumentsTable.classification, "contract"),
      eq(projectDocumentsTable.isEntryAgreement, false),
      sql`upper(trim(regexp_replace(${projectDocumentsTable.name}, '\\.[^./]+$', ''))) = ${STANDARD_ENTRY_AGREEMENT_TITLE}`,
    ))
    .returning({ id: projectDocumentsTable.id });

  return updated.length;
};