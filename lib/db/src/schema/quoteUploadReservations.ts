import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const quoteUploadReservationsTable = pgTable("quote_upload_reservations", {
  id: text("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  state: text("state").notNull().default("pending"),
  attachedQuoteId: text("attached_quote_id"),
  fingerprint: text("fingerprint"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
