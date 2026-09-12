import { boolean, date, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectScheduleMetadataTable = pgTable("project_schedule_metadata", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  imageId: text("image_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  revision: text("revision"),
  effectiveDate: date("effective_date", { mode: "string" }),
  isCurrent: boolean("is_current").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("project_schedule_metadata_project_image_idx").on(table.projectId, table.imageId),
  uniqueIndex("project_schedule_metadata_current_idx")
    .on(table.projectId, table.workspaceId)
    .where(sql`${table.isCurrent} = true`),
]);

export const insertProjectScheduleMetadataSchema = createInsertSchema(projectScheduleMetadataTable).omit({
  updatedAt: true,
});

export type InsertProjectScheduleMetadata = z.infer<typeof insertProjectScheduleMetadataSchema>;
export type ProjectScheduleMetadata = typeof projectScheduleMetadataTable.$inferSelect;