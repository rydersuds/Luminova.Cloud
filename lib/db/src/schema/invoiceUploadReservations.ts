import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoiceUploadReservationsTable = pgTable("invoice_upload_reservations", {
  objectPath: text("object_path").primaryKey(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attachedInvoiceId: text("attached_invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInvoiceUploadReservationSchema = createInsertSchema(invoiceUploadReservationsTable).omit({ createdAt: true });
export type InsertInvoiceUploadReservation = z.infer<typeof insertInvoiceUploadReservationSchema>;
export type InvoiceUploadReservation = typeof invoiceUploadReservationsTable.$inferSelect;