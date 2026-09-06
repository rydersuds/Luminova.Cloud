import { Router, type IRouter } from "express";
import {
  CreateInvoiceBody,
  CreateInvoiceResponse,
  CreateProjectBody,
  CreateProjectResponse,
  GetDashboardSummaryResponse,
  GetInvoicesQueryParams,
  GetInvoicesResponse,
  GetProjectActivityParams,
  GetProjectActivityResponse,
  GetProjectParams,
  GetProjectResponse,
  GetProjectsQueryParams,
  GetProjectsResponse,
  GetTradeParams,
  GetTradeResponse,
  GetTradesQueryParams,
  GetTradesResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const activities = [
  { id: "act-1", type: "invoice", title: "Invoice auto-approved", description: "Northline Electric invoice INV-2048 was within the electrical budget.", author: "System", date: "2026-09-04T16:40:00.000Z" },
  { id: "act-2", type: "photo", title: "12 site photos added", description: "Framing progress from the second-floor walkthrough.", author: "Maya Chen", date: "2026-09-04T14:15:00.000Z" },
  { id: "act-3", type: "panorama", title: "New 360° walkthrough", description: "Main floor panorama captured after mechanical rough-in.", author: "Jordan Bell", date: "2026-09-03T20:05:00.000Z" },
  { id: "act-4", type: "status", title: "Project moved to In progress", description: "Riverstone Residence mobilization is complete.", author: "Maya Chen", date: "2026-09-02T15:20:00.000Z" },
];

const trades = [
  { id: "trade-1", companyName: "Northline Electric", contactName: "Evan Mercer", tradeType: "Electrical", region: "Calgary", rating: 4.9, reviewCount: 18, completedJobs: 31, initials: "NE", accent: "#AD9C4C" },
  { id: "trade-2", companyName: "Prairie Flow Mechanical", contactName: "Danika Roy", tradeType: "Plumbing", region: "Calgary", rating: 4.7, reviewCount: 14, completedJobs: 26, initials: "PF", accent: "#2563EB" },
  { id: "trade-3", companyName: "Summit Frame & Form", contactName: "Noah Cardinal", tradeType: "Framing", region: "Canmore", rating: 4.8, reviewCount: 22, completedJobs: 43, initials: "SF", accent: "#2E7D4F" },
  { id: "trade-4", companyName: "Altitude Exteriors", contactName: "Leah Park", tradeType: "Roofing", region: "Canmore", rating: 4.6, reviewCount: 11, completedJobs: 19, initials: "AE", accent: "#C2410C" },
  { id: "trade-5", companyName: "True North Concrete", contactName: "Owen Bains", tradeType: "Concrete", region: "Edmonton", rating: 4.5, reviewCount: 16, completedJobs: 38, initials: "TN", accent: "#6B6862" },
  { id: "trade-6", companyName: "Clearline Interiors", contactName: "Sofia Marquez", tradeType: "Drywall", region: "Calgary", rating: 4.8, reviewCount: 20, completedJobs: 47, initials: "CI", accent: "#7A6626" },
];

let projects = [
  {
    id: "riverstone",
    name: "Riverstone Residence",
    address: "128 Riverstone View, Calgary, AB",
    region: "Calgary",
    status: "In progress",
    progress: 64,
    pmName: "Maya Chen",
    clientName: "Avery & Morgan Reid",
    targetDate: "2027-02-12",
    budgeted: 186500000,
    invoiced: 112840000,
    exteriorImage: "https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1200",
    description: "A warm modern infill home with a limestone exterior, expansive glazing, and a highly detailed millwork package.",
  },
  {
    id: "ridge-house",
    name: "Ridge House",
    address: "46 Eagle Ridge Close, Canmore, AB",
    region: "Canmore",
    status: "In progress",
    progress: 38,
    pmName: "Jordan Bell",
    clientName: "The Laurent Family",
    targetDate: "2027-05-28",
    budgeted: 241000000,
    invoiced: 83420000,
    exteriorImage: "https://images.pexels.com/photos/7031408/pexels-photo-7031408.jpeg?auto=compress&cs=tinysrgb&w=1200",
    description: "Mountain residence designed around long valley views, durable natural materials, and high-performance envelope assemblies.",
  },
  {
    id: "westmount",
    name: "Westmount Renovation",
    address: "10214 129 Street NW, Edmonton, AB",
    region: "Edmonton",
    status: "On hold",
    progress: 72,
    pmName: "Maya Chen",
    clientName: "Nadia Foster",
    targetDate: "2026-12-18",
    budgeted: 89500000,
    invoiced: 92630000,
    exteriorImage: "https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200",
    description: "Whole-home renovation preserving the original brick shell while introducing contemporary interiors and upgraded systems.",
  },
  {
    id: "cedar-court",
    name: "Cedar Court",
    address: "211 Cedarpark Green SW, Calgary, AB",
    region: "Calgary",
    status: "Pre-construction",
    progress: 12,
    pmName: "Jordan Bell",
    clientName: "Arden Cooper",
    targetDate: "2027-09-10",
    budgeted: 147500000,
    invoiced: 8600000,
    exteriorImage: "https://images.pexels.com/photos/53610/large-home-residential-house-architecture-53610.jpeg?auto=compress&cs=tinysrgb&w=1200",
    description: "Compact urban new build focused on flexible family spaces, daylight, and a private landscaped courtyard.",
  },
];

let invoices = [
  { id: "inv-1", invoiceNumber: "INV-2048", projectId: "riverstone", projectName: "Riverstone Residence", vendor: "Northline Electric", amount: 1845000, date: "2026-09-04", status: "Auto-approved", lineItem: "26 00 00 · Electrical", overage: 0 },
  { id: "inv-2", invoiceNumber: "PFM-889", projectId: "riverstone", projectName: "Riverstone Residence", vendor: "Prairie Flow Mechanical", amount: 932500, date: "2026-09-03", status: "Pending approval", lineItem: "22 00 00 · Plumbing", overage: 128500 },
  { id: "inv-3", invoiceNumber: "CL-4421", projectId: "ridge-house", projectName: "Ridge House", vendor: "Clearline Interiors", amount: 2760000, date: "2026-09-01", status: "Auto-approved", lineItem: "09 29 00 · Drywall", overage: 0 },
  { id: "inv-4", invoiceNumber: "AE-1062", projectId: "ridge-house", projectName: "Ridge House", vendor: "Altitude Exteriors", amount: 4125000, date: "2026-08-28", status: "Approved", lineItem: "07 31 00 · Roofing", overage: 375000 },
];

const detailsFor = (project: (typeof projects)[number]) => ({
  ...project,
  startDate: "2026-03-18",
  clientQuote: {
    total: project.budgeted,
    revision: "Revision 3 · August 21, 2026",
    portions: [
      { code: "03 00 00", label: "Concrete", amount: Math.round(project.budgeted * 0.16) },
      { code: "06 10 00", label: "Framing", amount: Math.round(project.budgeted * 0.22) },
      { code: "22 00 00", label: "Plumbing", amount: Math.round(project.budgeted * 0.13) },
      { code: "26 00 00", label: "Electrical", amount: Math.round(project.budgeted * 0.14) },
      { code: "09 00 00", label: "Interiors & finishes", amount: Math.round(project.budgeted * 0.35) },
    ],
  },
  lineItems: [
    { id: "line-1", code: "03 00 00", description: "Concrete", budgeted: 29840000, invoiced: 27150000, variance: 2690000 },
    { id: "line-2", code: "06 10 00", description: "Rough carpentry", budgeted: 41030000, invoiced: 43820000, variance: -2790000 },
    { id: "line-3", code: "22 00 00", description: "Plumbing", budgeted: 24245000, invoiced: 23440000, variance: 805000 },
    { id: "line-4", code: "26 00 00", description: "Electrical", budgeted: 26110000, invoiced: 18450000, variance: 7660000 },
    { id: "line-5", code: "09 00 00", description: "Interiors & finishes", budgeted: 65275000, invoiced: 0, variance: 65275000 },
  ],
  invoices: invoices.filter((invoice) => invoice.projectId === project.id),
  trades: trades.slice(0, 4),
  photos: [
    { id: "photo-1", url: "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Second-floor framing walkthrough", phase: "Framing", date: "2026-09-04" },
    { id: "photo-2", url: "https://images.pexels.com/photos/209251/pexels-photo-209251.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Mechanical rough-in progress", phase: "Rough-in", date: "2026-09-03" },
    { id: "photo-3", url: "https://images.pexels.com/photos/159306/construction-site-build-construction-work-159306.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Exterior envelope inspection", phase: "Envelope", date: "2026-08-29" },
  ],
  panoramas: [
    { id: "pano-1", url: "https://images.pexels.com/photos/37347/office-sitting-room-executive-sitting.jpg?auto=compress&cs=tinysrgb&w=1600", label: "Week 24", location: "Main floor", date: "2026-09-03" },
    { id: "pano-2", url: "https://images.pexels.com/photos/271667/pexels-photo-271667.jpeg?auto=compress&cs=tinysrgb&w=1600", label: "Week 20", location: "Great room", date: "2026-08-06" },
  ],
  activity: activities,
});

router.get("/dashboard/summary", (_req, res) => {
  res.json(GetDashboardSummaryResponse.parse({
    activeProjects: projects.filter((project) => project.status === "In progress").length,
    awaitingApproval: invoices.filter((invoice) => invoice.status === "Pending approval").length,
    unreadMessages: 7,
    new360Photos: 3,
    budgeted: projects.reduce((sum, project) => sum + project.budgeted, 0),
    invoiced: projects.reduce((sum, project) => sum + project.invoiced, 0),
    recentActivity: activities,
  }));
});

router.get("/projects", (req, res) => {
  const parsed = GetProjectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, search, region } = parsed.data;
  const result = projects.filter((project) =>
    (!status || project.status === status) &&
    (!region || project.region === region) &&
    (!search || `${project.name} ${project.address} ${project.clientName}`.toLowerCase().includes(search.toLowerCase())),
  );
  res.json(GetProjectsResponse.parse(result));
});

router.post("/projects", (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = {
    ...parsed.data,
    id: `${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now()}`,
    progress: 0,
    invoiced: 0,
    exteriorImage: parsed.data.exteriorImage ?? "",
  };
  projects = [project, ...projects];
  res.status(201).json(CreateProjectResponse.parse(project));
});

router.get("/projects/:projectId", (req, res) => {
  const parsed = GetProjectParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = projects.find((item) => item.id === parsed.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(GetProjectResponse.parse(detailsFor(project)));
});

router.patch("/projects/:projectId", (req, res) => {
  const params = UpdateProjectParams.safeParse(req.params);
  const body = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid project update" });
    return;
  }
  const index = projects.findIndex((project) => project.id === params.data.projectId);
  if (index === -1) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  projects[index] = { ...projects[index], ...body.data };
  res.json(UpdateProjectResponse.parse(projects[index]));
});

router.get("/projects/:projectId/activity", (req, res) => {
  const parsed = GetProjectActivityParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(GetProjectActivityResponse.parse(activities));
});

router.get("/trades", (req, res) => {
  const parsed = GetTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, tradeType, region } = parsed.data;
  const result = trades.filter((trade) =>
    (!tradeType || trade.tradeType === tradeType) &&
    (!region || trade.region === region) &&
    (!search || `${trade.companyName} ${trade.contactName} ${trade.tradeType}`.toLowerCase().includes(search.toLowerCase())),
  );
  res.json(GetTradesResponse.parse(result));
});

router.get("/trades/:tradeId", (req, res) => {
  const parsed = GetTradeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const trade = trades.find((item) => item.id === parsed.data.tradeId);
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json(GetTradeResponse.parse({
    ...trade,
    phone: "403-555-0188",
    email: `hello@${trade.companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}.ca`,
    website: "https://example.com",
    licence: "AB-WCB-449218",
    insuranceExpiry: "2027-04-30",
    regions: [trade.region, "Calgary", "Canmore"],
    reviews: [
      { projectName: "Riverstone Residence", reviewer: "Maya Chen", date: "2026-08-28", rating: 5, comment: "Exceptionally organized on site and proactive about coordinating rough-in conflicts." },
      { projectName: "Elbow Park Renovation", reviewer: "Jordan Bell", date: "2026-05-14", rating: 5, comment: "Clean work, accurate pricing, and excellent communication through closeout." },
    ],
    jobHistory: [
      { projectName: "Riverstone Residence", date: "2026", amount: 26850000 },
      { projectName: "Elbow Park Renovation", date: "2025", amount: 14900000 },
    ],
    bids: [
      { projectName: "Riverstone Residence", scope: trade.tradeType, amount: 26850000, date: "2026-02-12", outcome: "Won" },
      { projectName: "Ridge House", scope: trade.tradeType, amount: 34200000, date: "2026-06-08", outcome: "Pending" },
    ],
  }));
});

router.get("/invoices", (req, res) => {
  const parsed = GetInvoicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = parsed.data.status ? invoices.filter((invoice) => invoice.status === parsed.data.status) : invoices;
  res.json(GetInvoicesResponse.parse(result));
});

router.post("/invoices", (req, res) => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = projects.find((item) => item.id === parsed.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const remaining = Math.max(project.budgeted - project.invoiced, 0);
  const overage = Math.max(parsed.data.amount - remaining, 0);
  const invoice = {
    ...parsed.data,
    id: `inv-${Date.now()}`,
    projectName: project.name,
    status: overage > 0 ? "Pending approval" : "Auto-approved",
    overage,
  };
  invoices = [invoice, ...invoices];
  res.status(201).json(CreateInvoiceResponse.parse(invoice));
});

export default router;