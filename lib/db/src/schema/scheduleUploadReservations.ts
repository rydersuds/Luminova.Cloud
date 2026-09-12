import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const scheduleUploadReservationsTable = pgTable("schedule_upload_reservations", {
  objectPath: text("object_path").primaryKey(),
  ownerId: text("owner_id").notNull(),
  projectId: text("project_id").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  status: text("status").notNull().default("reserved"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduleUploadReservation = typeof scheduleUploadReservationsTable.$inferSelect;