import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const projectExteriorPhotosTable = pgTable("project_exterior_photos", {
  projectId: text("project_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  exteriorImage: text("exterior_image").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProjectExteriorPhoto = typeof projectExteriorPhotosTable.$inferSelect;