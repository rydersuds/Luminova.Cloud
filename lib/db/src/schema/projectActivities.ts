import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectActivitiesTable = pgTable("project_activities", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerId: text("owner_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  author: text("author").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectActivitySchema = createInsertSchema(projectActivitiesTable).omit({
  createdAt: true,
});

export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
export type ProjectActivity = typeof projectActivitiesTable.$inferSelect;