import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectScheduleImagesTable = pgTable("project_schedule_images", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  name: text("name").notNull(),
  relativePath: text("relative_path").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectScheduleImageSchema = createInsertSchema(projectScheduleImagesTable).omit({
  createdAt: true,
});

export type InsertProjectScheduleImage = z.infer<typeof insertProjectScheduleImageSchema>;
export type ProjectScheduleImage = typeof projectScheduleImagesTable.$inferSelect;