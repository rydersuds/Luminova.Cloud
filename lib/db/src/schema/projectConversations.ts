import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectConversationsTable = pgTable("project_conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  ownerId: text("owner_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  context: text("context").notNull().default("Project channel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("project_conversations_workspace_project_idx").on(table.workspaceId, table.projectId),
  index("project_conversations_owner_idx").on(table.ownerId),
]);

export const projectMessagesTable = pgTable("project_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ownerId: text("owner_id").notNull(),
  projectId: text("project_id").notNull(),
  senderId: text("sender_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("project_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  index("project_messages_workspace_project_idx").on(table.workspaceId, table.projectId),
  index("project_messages_owner_idx").on(table.ownerId),
]);

export const insertProjectConversationSchema = createInsertSchema(projectConversationsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertProjectMessageSchema = createInsertSchema(projectMessagesTable).omit({ createdAt: true });
export type InsertProjectConversation = z.infer<typeof insertProjectConversationSchema>;
export type ProjectConversation = typeof projectConversationsTable.$inferSelect;
export type InsertProjectMessage = z.infer<typeof insertProjectMessageSchema>;
export type ProjectMessage = typeof projectMessagesTable.$inferSelect;