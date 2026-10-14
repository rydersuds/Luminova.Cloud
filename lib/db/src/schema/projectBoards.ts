import { date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Monday-style project boards: each project has ordered groups (phases) holding ordered items (tasks).
// Boards are shared by everyone in the workspace who can open the project.

export const projectBoardGroupsTable = pgTable("project_board_groups", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("gold"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("project_board_groups_project_idx").on(table.workspaceId, table.projectId),
]);

export const projectBoardItemsTable = pgTable("project_board_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  groupId: text("group_id").notNull().references(() => projectBoardGroupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("Not started"),
  color: text("color"),
  priority: text("priority"),
  assignee: text("assignee"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  costCents: integer("cost_cents"),
  dependsOnId: text("depends_on_id"),
  position: integer("position").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("project_board_items_project_idx").on(table.workspaceId, table.projectId),
  index("project_board_items_group_idx").on(table.groupId),
]);

export const insertProjectBoardGroupSchema = createInsertSchema(projectBoardGroupsTable).omit({ createdAt: true, updatedAt: true });
export type InsertProjectBoardGroup = z.infer<typeof insertProjectBoardGroupSchema>;
export type ProjectBoardGroupRow = typeof projectBoardGroupsTable.$inferSelect;

export const insertProjectBoardItemSchema = createInsertSchema(projectBoardItemsTable).omit({ createdAt: true, updatedAt: true });
export type InsertProjectBoardItem = z.infer<typeof insertProjectBoardItemSchema>;
export type ProjectBoardItemRow = typeof projectBoardItemsTable.$inferSelect;
