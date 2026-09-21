import { and, eq } from "drizzle-orm";
import {
  db,
  standaloneVendorProfilesTable,
  type StandaloneVendorProfileData,
} from "@workspace/db";

export type SeededVendorProfile = StandaloneVendorProfileData & {
  seedKey: string;
};

const profile = (
  seedKey: string,
  companyName: string,
  specialties: string[],
  details: Partial<Pick<StandaloneVendorProfileData, "contactName" | "phone" | "email" | "regions" | "sourceNotes">> = {},
): SeededVendorProfile => ({
  seedKey,
  companyName,
  contactName: details.contactName ?? "",
  tradeType: specialties[0] ?? "General",
  specialties,
  region: details.regions?.[0] ?? "",
  regions: details.regions ?? [],
  rating: 0,
  reviewCount: 0,
  completedJobs: 0,
  initials: companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "VN",
  accent: "#64748B",
  phone: details.phone ?? "",
  email: details.email ?? "",
  website: "",
  licence: "",
  insurance: "",
  insuranceExpiry: "",
  sourceNotes: details.sourceNotes ?? "",
});

export const seededVendorProfiles: SeededVendorProfile[] = [
  profile("moe-houri", "Moe Houri", ["Mechanical Engineering"], {
    email: "moe.houri@tamimyengineering.com",
    phone: "403 689 9004",
  }),
  profile("acn-abatement-chris-stewart", "Abatement and Demolition Services Ltd (Cerkal ACN)", [
    "Demolition & Abatement & General Labour",
  ], {
    contactName: "Chris Stewart",
    phone: "1-825-966-1728",
    email: "chris@acnabatement.ca",
    regions: ["Calgary", "Edmonton", "Saskatoon", "Regina"],
  }),
  profile("quality-concrete-cutting-hardeep", "Quality Concrete Cutting & Coring Ltd", ["Concrete"], {
    contactName: "Hardeep",
    phone: "403-466-2842",
    email: "Office@qcccltd.ca",
  }),
  profile("astons-martin-aston", "Astons", ["Stucco"], {
    contactName: "Martin Aston",
    phone: "587-586-1467",
    email: "conqueroraston@gmail.com",
  }),
  profile("rvw-windows-alex-gazin", "RVW Windows", ["Windows and Exterior Doors"], {
    contactName: "Alex Gazin",
    phone: "403-689-4926",
    email: "alexgazimov@gmail.com",
  }),
  profile("drybuild-group-mike", "DryBuild Group LTD", [
    "Drywall Boarding",
    "Drywall Taping",
    "T-Bar Ceiling",
  ], {
    contactName: "Mykhaylo (Mike)",
    phone: "825-747-0464",
    email: "drybuildalberta@gmail.com",
    sourceNotes: "Quoting Strahmore",
  }),
  profile("2247052-alberta-alex", "2247052 Alberta LTD", ["Drywall Boarding"], {
    contactName: "Alex",
    phone: "403-796-3375",
    email: "2247052alberta@gmail.com",
    sourceNotes: "labour only; Did Royal Oak Neighbor",
  }),
  profile("akal-drywalling", "Akal Drywalling", ["Drywall Boarding", "Drywall Taping"], {
    phone: "778-893-8004",
    sourceNotes: "2245709 Alberta Ltd; Did Garisson Basement",
  }),
  profile("kostia", "Kostia", ["Drywall Boarding"], {
    phone: "1-825-288-4300",
    sourceNotes: "labour only; recommended by Venkor",
  }),
  profile("oleg", "Oleg", ["Drywall Taping"], {
    phone: "587-968-1075",
    sourceNotes: "recommended by Venkor",
  }),
  profile("serghei-socolnicov", "Serghei Socolnicov", ["Drywall Taping"], {
    phone: "587-892-3732",
    email: "sps.sokol@gmail.com",
    sourceNotes: "Did Sommerset, Royal Oak",
  }),
  profile("dalrymple-construction-david", "Dalrymple Construction Ltd", ["Drywall Taping"], {
    contactName: "David Dalrymple",
    phone: "3065319176",
    email: "david.dalrymple@sasktel.net",
    regions: ["Regina"],
    sourceNotes: "348 Brookview dr Regina SK S4Y 0B3 Canada",
  }),
  profile("dawn-b-wright", "Dawn B. Wright drywall", ["Drywall Taping"], {
    contactName: "Dawn",
    phone: "780-818-1448",
    regions: ["Edmonton"],
  }),
  profile("feras-sparta-construction", "Feras Sparta Construction", ["Painting"], {
    contactName: "Feras",
    phone: "403-519-7558",
    email: "sparta0202@hotmail.com",
  }),
  profile("ong-painting", "ONG Painting", ["Painting"], {
    contactName: "Bruce",
    phone: "403-4775-658",
  }),
  profile("pam-painting-edmonton", "Pam Painting Edmonton", ["Painting"], {
    contactName: "Pam",
    phone: "780-716-9242",
    regions: ["Edmonton"],
  }),
  profile("precision-construction-company", "Precision Construction Company", ["Painting"], {
    phone: "587-969-0298",
    email: "precision.construction.ca@gmail.com",
    regions: ["Regina"],
    sourceNotes: "Residential & Commercial Services",
  }),
  profile("viet-do", "Viet Do", ["Painting"], {
    phone: "204-955-0899",
    regions: ["Winnipeg"],
  }),
  profile("thanh-vu", "Thanh Vu", ["T-Bar Ceiling"], {
    phone: "647-821-6899",
    regions: ["Calgary"],
  }),
];

export async function ensureSeededVendorProfiles(workspaceId: string): Promise<void> {
  if (!workspaceId) return;

  await db.insert(standaloneVendorProfilesTable).values(
    seededVendorProfiles.map((vendor) => ({
      id: `standalone-vendor-${workspaceId}-${vendor.seedKey}`,
      workspaceId,
      seedKey: vendor.seedKey,
      data: vendor,
    })),
  ).onConflictDoNothing();
}

export async function getStandaloneVendorProfile(
  tradeId: string,
  workspaceId: string,
): Promise<{ id: string; workspaceId: string; seedKey: string; data: StandaloneVendorProfileData } | undefined> {
  const [row] = await db.select()
    .from(standaloneVendorProfilesTable)
    .where(and(
      eq(standaloneVendorProfilesTable.id, tradeId),
      eq(standaloneVendorProfilesTable.workspaceId, workspaceId),
    ))
    .limit(1);
  return row;
}