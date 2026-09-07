import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const projectImportBatchesTable = pgTable("project_import_batches", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull(),
  analysis: jsonb("analysis").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectDocumentsTable = pgTable("project_documents", {
  id: text("id").primaryKey(),
  importBatchId: text("import_batch_id").notNull(),
  projectId: text("project_id").notNull(),
  ownerId: text("owner_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  relativePath: text("relative_path").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  classification: text("classification").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const importedRecordColumns = {
  id: text("id").primaryKey(),
  importBatchId: text("import_batch_id").notNull(),
  ownerId: text("owner_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const importedProjectsTable = pgTable("imported_projects", importedRecordColumns);

export const importedVendorsTable = pgTable("imported_vendors", importedRecordColumns);

export const importedVendorQuotesTable = pgTable("imported_vendor_quotes", importedRecordColumns);

export const importedInvoicesTable = pgTable("imported_invoices", importedRecordColumns);