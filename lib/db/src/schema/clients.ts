import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("clients_workspace_name_unique").on(table.workspaceId, table.name),
  index("clients_workspace_idx").on(table.workspaceId),
]);

export const clientMembersTable = pgTable("client_members", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("client_members_client_user_unique").on(table.clientId, table.userId),
  index("client_members_client_idx").on(table.clientId),
  index("client_members_user_idx").on(table.userId),
]);

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertClientMemberSchema = createInsertSchema(clientMembersTable).omit({
  createdAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
export type InsertClientMember = z.infer<typeof insertClientMemberSchema>;
export type ClientMember = typeof clientMembersTable.$inferSelect;