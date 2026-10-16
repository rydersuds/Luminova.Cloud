export type ModuleKey =
  | "command" | "projects" | "project" | "schedule" | "trades" | "quotes"
  | "financials" | "users" | "profile";

export type ProjectStatus = "On track" | "Watch" | "At risk";
export type BoardStatus = "To do" | "In progress" | "Review" | "Done";

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  type: string;
  status: ProjectStatus;
  progress: number;
  budget: number;
  spent: number;
  start: string;
  finish: string;
  lead: string;
  phase: string;
  accent: string;
  image: string;
}

export interface BoardCard {
  id: string;
  title: string;
  projectId: string;
  trade: string;
  due: string;
  assignee: string;
  status: BoardStatus;
}

export interface Vendor {
  id: string;
  name: string;
  trade: string;
  contact: string;
  email: string;
  phone: string;
  rating: string;
  activeJobs: number;
  status: string;
}

export interface Quote {
  id: string;
  vendorId: string;
  projectId: string;
  title: string;
  amount: number;
  submitted: string;
  expires: string;
  status: "Review" | "Approved" | "Declined";
  lines: { label: string; amount: number }[];
}

export interface Invoice {
  id: string;
  vendorId: string;
  projectId: string;
  number: string;
  amount: number;
  date: string;
  due: string;
  status: "Pending approval" | "Approved" | "Paid" | "Declined";
  description: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  initials: string;
  access: string;
  projectIds: string[];
}

export interface SitePhoto {
  id: string;
  projectId: string;
  title: string;
  date: string;
  author: string;
  kind: "Photo" | "360°";
  scene: string;
}

export interface Activity {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  time: string;
  author: string;
}

export interface DemoData {
  projects: Project[];
  board: BoardCard[];
  vendors: Vendor[];
  quotes: Quote[];
  invoices: Invoice[];
  team: TeamMember[];
  photos: SitePhoto[];
  activity: Activity[];
}

export const initialDemoData: DemoData = {
  projects: [
    { id: "riverstone", name: "Riverstone House", client: "Marlowe Properties", location: "Boulder, CO", type: "Custom residence", status: "On track", progress: 68, budget: 2840000, spent: 1932400, start: "2025-02-03", finish: "2025-11-21", lead: "Morgan Reyes", phase: "Interior closeout", accent: "from-[#65786b] to-[#253e38]", image: "ridge" },
    { id: "northline", name: "Northline Commons", client: "Northline Development", location: "Denver, CO", type: "Mixed-use · 42 units", status: "Watch", progress: 42, budget: 6850000, spent: 3021700, start: "2025-01-13", finish: "2026-03-06", lead: "Avery Chen", phase: "Structure & envelope", accent: "from-[#837a67] to-[#343a39]", image: "urban" },
    { id: "cedar", name: "Cedar & Slate", client: "Juniper Hospitality", location: "Golden, CO", type: "Hospitality renovation", status: "At risk", progress: 81, budget: 1620000, spent: 1377000, start: "2024-12-02", finish: "2025-08-29", lead: "Morgan Reyes", phase: "Final inspections", accent: "from-[#90715f] to-[#41352f]", image: "timber" },
    { id: "mesa", name: "Mesa Arts Annex", client: "City of Arvada", location: "Arvada, CO", type: "Civic · 8,400 sq ft", status: "On track", progress: 19, budget: 4120000, spent: 738000, start: "2025-04-14", finish: "2026-06-12", lead: "Jordan Blake", phase: "Foundations", accent: "from-[#777f80] to-[#303d43]", image: "mesa" },
  ],
  board: [
    { id: "b1", title: "Confirm stair rail field dimensions", projectId: "riverstone", trade: "Ironwork", due: "Jun 18", assignee: "Morgan Reyes", status: "To do" },
    { id: "b2", title: "Kitchen millwork install · level 2", projectId: "riverstone", trade: "Millwork", due: "Jun 20", assignee: "Avery Chen", status: "In progress" },
    { id: "b3", title: "Walkthrough: primary bath tile", projectId: "riverstone", trade: "Tile", due: "Jun 17", assignee: "Morgan Reyes", status: "Review" },
    { id: "b4", title: "Release glazing shop drawings", projectId: "northline", trade: "Glazing", due: "Jun 24", assignee: "Avery Chen", status: "To do" },
    { id: "b5", title: "West elevation sheathing", projectId: "northline", trade: "Framing", due: "Jun 19", assignee: "Jordan Blake", status: "In progress" },
    { id: "b6", title: "Courtyard waterproofing test", projectId: "northline", trade: "Waterproofing", due: "Jun 16", assignee: "Morgan Reyes", status: "Review" },
    { id: "b7", title: "Fire marshal re-inspection", projectId: "cedar", trade: "Life safety", due: "Jun 21", assignee: "Morgan Reyes", status: "To do" },
    { id: "b8", title: "Bar millwork punch list", projectId: "cedar", trade: "Millwork", due: "Jun 14", assignee: "Avery Chen", status: "Done" },
  ],
  vendors: [
    { id: "v1", name: "Summit Millwork Co.", trade: "Millwork", contact: "Elena Park", email: "elena@summitmillwork.co", phone: "(303) 555-0142", rating: "4.9", activeJobs: 3, status: "Preferred" },
    { id: "v2", name: "Front Range Electric", trade: "Electrical", contact: "Drew Lawson", email: "drew@frontrangeelectric.com", phone: "(720) 555-0188", rating: "4.7", activeJobs: 2, status: "Active" },
    { id: "v3", name: "Alpine Glassworks", trade: "Glazing", contact: "Priya Nair", email: "priya@alpineglass.co", phone: "(303) 555-0126", rating: "4.8", activeJobs: 2, status: "Preferred" },
    { id: "v4", name: "Stonepath Tile & Stone", trade: "Tile & stone", contact: "Luis Ortega", email: "luis@stonepath.co", phone: "(970) 555-0171", rating: "4.6", activeJobs: 2, status: "Active" },
    { id: "v5", name: "High Country Concrete", trade: "Concrete", contact: "Sam Whitaker", email: "sam@highcountryconcrete.com", phone: "(303) 555-0160", rating: "4.5", activeJobs: 1, status: "Active" },
    { id: "v6", name: "Copperline Mechanical", trade: "Mechanical", contact: "Noah Singh", email: "noah@copperline.co", phone: "(720) 555-0193", rating: "4.8", activeJobs: 3, status: "Preferred" },
  ],
  quotes: [
    { id: "q1", vendorId: "v1", projectId: "riverstone", title: "Level 2 custom cabinetry", amount: 68450, submitted: "Jun 12", expires: "Jun 26", status: "Review", lines: [{ label: "Fabrication · walnut veneer", amount: 42800 }, { label: "Hardware & finish", amount: 9650 }, { label: "Delivery and installation", amount: 16000 }] },
    { id: "q2", vendorId: "v4", projectId: "riverstone", title: "Primary suite stonework", amount: 38240, submitted: "Jun 10", expires: "Jun 24", status: "Approved", lines: [{ label: "Slab supply", amount: 24800 }, { label: "Template & installation", amount: 13440 }] },
    { id: "q3", vendorId: "v3", projectId: "northline", title: "East elevation storefront", amount: 128600, submitted: "Jun 13", expires: "Jun 27", status: "Review", lines: [{ label: "Thermal storefront system", amount: 96300 }, { label: "Glazing & hardware", amount: 32300 }] },
    { id: "q4", vendorId: "v6", projectId: "cedar", title: "Kitchen make-up air revision", amount: 12780, submitted: "Jun 08", expires: "Jun 22", status: "Review", lines: [{ label: "Equipment & duct revisions", amount: 8400 }, { label: "Startup and balancing", amount: 4380 }] },
    { id: "q5", vendorId: "v5", projectId: "mesa", title: "Foundation pour · phase 1", amount: 94600, submitted: "Jun 04", expires: "Jun 19", status: "Declined", lines: [{ label: "Footings and grade beams", amount: 71200 }, { label: "Pump, place & finish", amount: 23400 }] },
  ],
  invoices: [
    { id: "i1", vendorId: "v1", projectId: "riverstone", number: "SM-24061", amount: 18640, date: "Jun 12", due: "Jun 27", status: "Pending approval", description: "Cabinetry progress draw · 40%" },
    { id: "i2", vendorId: "v6", projectId: "northline", number: "CM-11842", amount: 32750, date: "Jun 11", due: "Jun 25", status: "Pending approval", description: "Rough-in billing · floors 3–4" },
    { id: "i3", vendorId: "v4", projectId: "cedar", number: "ST-09117", amount: 8640, date: "Jun 09", due: "Jun 24", status: "Approved", description: "Lobby stone setting · final" },
    { id: "i4", vendorId: "v5", projectId: "mesa", number: "HC-20318", amount: 48750, date: "Jun 05", due: "Jun 20", status: "Paid", description: "Mobilization and site prep" },
  ],
  team: [
    { id: "u1", name: "Morgan Reyes", role: "Project Manager", email: "morgan@luminova.build", initials: "MR", access: "Admin", projectIds: ["riverstone", "cedar"] },
    { id: "u2", name: "Avery Chen", role: "Senior Superintendent", email: "avery@luminova.build", initials: "AC", access: "Project lead", projectIds: ["riverstone", "northline"] },
    { id: "u3", name: "Jordan Blake", role: "Field Coordinator", email: "jordan@luminova.build", initials: "JB", access: "Field", projectIds: ["northline", "mesa"] },
    { id: "u4", name: "Elena Park", role: "Client representative", email: "elena@marloweprop.com", initials: "EP", access: "Client", projectIds: ["riverstone"] },
    { id: "u5", name: "Riley Foster", role: "Finance lead", email: "riley@luminova.build", initials: "RF", access: "Finance", projectIds: ["riverstone", "northline", "cedar", "mesa"] },
  ],
  photos: [
    { id: "p1", projectId: "riverstone", title: "South elevation · morning", date: "Today · 8:14 AM", author: "Morgan Reyes", kind: "Photo", scene: "ridge" },
    { id: "p2", projectId: "riverstone", title: "Kitchen millwork · level 2", date: "Yesterday · 3:42 PM", author: "Avery Chen", kind: "Photo", scene: "interior" },
    { id: "p3", projectId: "riverstone", title: "Primary suite · 360° walk", date: "Jun 14 · 11:06 AM", author: "Morgan Reyes", kind: "360°", scene: "panorama" },
    { id: "p4", projectId: "northline", title: "East elevation progress", date: "Today · 7:48 AM", author: "Jordan Blake", kind: "Photo", scene: "urban" },
    { id: "p5", projectId: "northline", title: "Level 4 · structural grid", date: "Jun 15 · 2:25 PM", author: "Avery Chen", kind: "360°", scene: "structure" },
    { id: "p6", projectId: "cedar", title: "Lounge · finish review", date: "Jun 13 · 4:10 PM", author: "Morgan Reyes", kind: "Photo", scene: "timber" },
    { id: "p7", projectId: "mesa", title: "West footing pour", date: "Jun 12 · 9:30 AM", author: "Jordan Blake", kind: "Photo", scene: "mesa" },
  ],
  activity: [
    { id: "a1", projectId: "riverstone", title: "Quote approved", detail: "Primary suite stonework · Stonepath Tile & Stone", time: "11:06 AM", author: "Morgan Reyes" },
    { id: "a2", projectId: "riverstone", title: "Site photo added", detail: "South elevation · morning", time: "8:14 AM", author: "Morgan Reyes" },
    { id: "a3", projectId: "northline", title: "Schedule updated", detail: "Steel inspection confirmed · Jun 20", time: "Yesterday", author: "Avery Chen" },
    { id: "a4", projectId: "cedar", title: "Invoice received", detail: "Lobby stone setting · $8,640", time: "Mon", author: "Riley Foster" },
    { id: "a5", projectId: "mesa", title: "Project started", detail: "Mobilization complete · foundations underway", time: "Jun 12", author: "Jordan Blake" },
  ],
};

export function cloneDemoData(): DemoData {
  return JSON.parse(JSON.stringify(initialDemoData)) as DemoData;
}
