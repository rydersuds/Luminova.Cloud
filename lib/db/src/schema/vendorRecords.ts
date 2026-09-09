import { date, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const vendorJobHistoryTable = pgTable("vendor_job_history", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  projectId: text("project_id").notNull(),
  completedDate: date("completed_date", { mode: "string" }).notNull(),
  amount: integer("amount").notNull(),
  source: text("source").notNull(),
  recordedBy: text("recorded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("vendor_job_history_vendor_project_unique").on(table.vendorId, table.projectId),
]);

export const vendorReviewTable = pgTable("vendor_reviews", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  projectId: text("project_id").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  reviewerName: text("reviewer_name").notNull(),
  reviewedDate: date("reviewed_date", { mode: "string" }).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("vendor_reviews_vendor_project_reviewer_unique").on(table.vendorId, table.projectId, table.reviewerId),
]);

export const insertVendorJobHistorySchema = createInsertSchema(vendorJobHistoryTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertVendorReviewSchema = createInsertSchema(vendorReviewTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type VendorJobHistory = typeof vendorJobHistoryTable.$inferSelect;
export type VendorReview = typeof vendorReviewTable.$inferSelect;