import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const projectImportBatchesTable = pgTable("project_import_batches", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull().default("default"),
  status: text("status").notNull(),
  manifest: jsonb("manifest").notNull().default([]),
  analysis: jsonb("analysis"),
  error: text("error"),
  buildLeaseId: text("build_lease_id"),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const projectDocumentsTable = pgTable("project_documents", {
  id: text("id").primaryKey(),
  importBatchId: text("import_batch_id").notNull(),
  projectId: text("project_id"),
  ownerId: text("owner_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  relativePath: text("relative_path").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  classification: text("classification").notNull(),
  isEntryAgreement: boolean("is_entry_agreement").notNull().default(false),
  collection: text("collection").notNull().default(""),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: text("linked_entity_id"),
  aiConfidence: integer("ai_confidence"),
  textSnippet: text("text_snippet"),
  visualCaption: text("visual_caption"),
  visualTags: jsonb("visual_tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("project_documents_import_path_unique").on(table.importBatchId, table.relativePath),
  index("project_documents_boundary_idx").on(table.ownerId, table.projectId, table.importBatchId),
]);

const importedRecordColumns = {
  id: text("id").primaryKey(),
  importBatchId: text("import_batch_id").notNull(),
  ownerId: text("owner_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const importedProjectsTable = pgTable("imported_projects", {
  ...importedRecordColumns,
  workspaceId: text("workspace_id").notNull().default("default"),
}, (table) => [
  index("imported_projects_workspace_idx").on(table.workspaceId),
]);

export const importedVendorsTable = pgTable("imported_vendors", importedRecordColumns);

export const importedVendorQuotesTable = pgTable("imported_vendor_quotes", importedRecordColumns);

export const importedInvoicesTable = pgTable("imported_invoices", importedRecordColumns);
