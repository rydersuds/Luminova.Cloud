import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectLifecycleEventsTable = pgTable("project_lifecycle_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  projectName: text("project_name").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("project_lifecycle_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
]);

export const insertProjectLifecycleEventSchema = createInsertSchema(projectLifecycleEventsTable).omit({
  createdAt: true,
});

export type InsertProjectLifecycleEvent = z.infer<typeof insertProjectLifecycleEventSchema>;
export type ProjectLifecycleEvent = typeof projectLifecycleEventsTable.$inferSelect;
