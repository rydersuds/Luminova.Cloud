import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type StandaloneVendorProfileData = {
  companyName: string;
  contactName: string;
  tradeType: string;
  specialties: string[];
  region: string;
  regions: string[];
  rating: number;
  reviewCount: number;
  completedJobs: number;
  initials: string;
  accent: string;
  phone: string;
  email: string;
  website: string;
  licence: string;
  insurance: string;
  insuranceExpiry: string;
  sourceNotes: string;
  profilePhotoObjectPath?: string | null;
  pendingProfilePhotoObjectPath?: string | null;
  profilePhotoPositionX?: number;
  profilePhotoPositionY?: number;
  profilePhotoZoom?: number;
};

export const standaloneVendorProfilesTable = pgTable("standalone_vendor_profiles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  seedKey: text("seed_key").notNull(),
  data: jsonb("data").$type<StandaloneVendorProfileData>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("standalone_vendor_profiles_workspace_seed_unique").on(table.workspaceId, table.seedKey),
  index("standalone_vendor_profiles_workspace_idx").on(table.workspaceId),
]);