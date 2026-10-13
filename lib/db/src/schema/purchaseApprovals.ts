import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Budget approvals for spending against a project's trade budgets.
// kind "purchase": someone checked a purchase before buying. Within the trade's remaining budget it is
//   auto-approved and its amount is committed (reserved) until an invoice is linked to it.
// kind "invoice": an invoice arrived over budget; the invoice itself carries the cost, this row the decision.
// Over-budget rows wait as "Pending approval" until an Admin approves or declines them.
export const purchaseApprovalsTable = pgTable("purchase_approvals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  importBatchId: text("import_batch_id").notNull(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  invoiceId: text("invoice_id"),
  budgetLineItemId: text("budget_line_item_id"),
  tradeLabel: text("trade_label").notNull(),
  vendor: text("vendor"),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  remainingBeforeCents: integer("remaining_before_cents"),
  overageCents: integer("overage_cents").notNull().default(0),
  status: text("status").notNull(),
  approvalReason: text("approval_reason").notNull(),
  requestedById: text("requested_by_id").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedById: text("decided_by_id"),
  decidedByName: text("decided_by_name"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  budgetIncreaseCents: integer("budget_increase_cents"),
}, (table) => [
  index("purchase_approvals_project_idx").on(table.workspaceId, table.projectId),
  index("purchase_approvals_status_idx").on(table.workspaceId, table.status),
]);

export const insertPurchaseApprovalSchema = createInsertSchema(purchaseApprovalsTable);
export type InsertPurchaseApproval = z.infer<typeof insertPurchaseApprovalSchema>;
export type PurchaseApprovalRow = typeof purchaseApprovalsTable.$inferSelect;
