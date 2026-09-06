import { date, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectPanoramasTable = pgTable("project_panoramas", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  label: text("label").notNull(),
  location: text("location").notNull(),
  captureDate: date("capture_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectPanoramaSchema = createInsertSchema(projectPanoramasTable).omit({
  createdAt: true,
});

export type InsertProjectPanorama = z.infer<typeof insertProjectPanoramaSchema>;
export type ProjectPanorama = typeof projectPanoramasTable.$inferSelect;