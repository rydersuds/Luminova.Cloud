import { Router, type IRouter } from "express";
import {
  CreateInvoiceBody,
  CreateInvoiceResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateProjectPanoramaBody,
  CreateProjectPanoramaParams,
  CreateProjectPanoramaResponse,
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
  UpdateProjectPanoramaBody,
  UpdateProjectPanoramaParams,
  UpdateProjectPanoramaResponse,
  CreateVendorQuoteBody,
  CreateVendorQuoteResponse,
  GetVendorQuoteParams,
  GetVendorQuoteResponse,
  GetVendorQuotesQueryParams,
  GetVendorQuotesResponse,
  UpdateVendorQuoteBody,
  UpdateVendorQuoteParams,
  UpdateVendorQuoteResponse,
} from "@workspace/api-zod";
import { DatabasePanoramaStore } from "../lib/panoramaStore";

const router: IRouter = Router();
const panoramaStore = new DatabasePanoramaStore();

const isValidCalendarDate = (date: string) => {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.valueOf()) && parsedDate.toISOString().slice(0, 10) === date;
};

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

const calculateQuoteLineItems = (lineItems: Array<{ id?: string; description: string; quantity: number; unitPrice: number }>) =>
  lineItems.map((item, index) => ({
    ...item,
    id: item.id || `quote-line-${Date.now()}-${index}`,
    amount: Math.round(item.quantity * item.unitPrice),
  }));

const dateOnly = (value: string | Date) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

let vendorQuotes = [
  {
    id: "vq-1001",
    quoteNumber: "NE-RS-026",
    projectId: "riverstone",
    projectName: "Riverstone Residence",
    vendorId: "trade-1",
    vendorName: "Northline Electric",
    trade: "Electrical",
    status: "Under review",
    revision: 2,
    issueDate: "2026-08-28",
    dueDate: "2026-09-12",
    notes: "Includes fixtures allowance and temporary power.",
    lineItems: [
      { id: "vql-1", description: "Electrical rough-in", quantity: 1, unitPrice: 1825000, amount: 1825000 },
      { id: "vql-2", description: "Fixtures allowance", quantity: 1, unitPrice: 480000, amount: 480000 },
    ],
    total: 2305000,
    createdAt: "2026-08-20T16:00:00.000Z",
    updatedAt: "2026-08-28T16:00:00.000Z",
  },
  {
    id: "vq-1002",
    quoteNumber: "PFM-889-Q",
    projectId: "riverstone",
    projectName: "Riverstone Residence",
    vendorId: "trade-2",
    vendorName: "Prairie Flow Mechanical",
    trade: "Plumbing",
    status: "Received",
    revision: 1,
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    notes: "Pricing valid for 30 days.",
    lineItems: [
      { id: "vql-3", description: "Plumbing rough-in package", quantity: 1, unitPrice: 3120000, amount: 3120000 },
    ],
    total: 3120000,
    createdAt: "2026-09-01T14:00:00.000Z",
    updatedAt: "2026-09-01T14:00:00.000Z",
  },
  {
    id: "vq-1003",
    quoteNumber: "SFF-RH-114",
    projectId: "ridge-house",
    projectName: "Ridge House",
    vendorId: "trade-3",
    vendorName: "Summit Frame & Form",
    trade: "Framing",
    status: "Accepted",
    revision: 3,
    issueDate: "2026-08-14",
    dueDate: "2026-08-31",
    notes: "Final negotiated framing scope.",
    lineItems: [
      { id: "vql-4", description: "Labour and supervision", quantity: 1, unitPrice: 5840000, amount: 5840000 },
      { id: "vql-5", description: "Lumber package", quantity: 1, unitPrice: 9460000, amount: 9460000 },
    ],
    total: 15300000,
    createdAt: "2026-08-04T18:30:00.000Z",
    updatedAt: "2026-08-14T18:30:00.000Z",
  },
  {
    id: "vq-1004",
    quoteNumber: "AE-RH-208",
    projectId: "ridge-house",
    projectName: "Ridge House",
    vendorId: "trade-4",
    vendorName: "Altitude Exteriors",
    trade: "Roofing",
    status: "Requested",
    revision: 1,
    issueDate: "2026-09-03",
    dueDate: "2026-09-18",
    notes: "",
    lineItems: [
      { id: "vql-6", description: "Standing seam roofing", quantity: 1, unitPrice: 0, amount: 0 },
    ],
    total: 0,
    createdAt: "2026-09-03T15:10:00.000Z",
    updatedAt: "2026-09-03T15:10:00.000Z",
  },
];

const detailsFor = async (project: (typeof projects)[number]) => ({
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
    ...await panoramaStore.list(project.id),
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

router.get("/projects/:projectId", async (req, res): Promise<void> => {
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
  try {
    res.json(GetProjectResponse.parse(await detailsFor(project)));
  } catch (error) {
    req.log.error({ err: error, projectId: project.id }, "Failed to load project panoramas");
    res.status(500).json({ error: "Project details could not be loaded." });
  }
});

router.post("/projects/:projectId/panoramas", async (req, res): Promise<void> => {
  const params = CreateProjectPanoramaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid project" });
    return;
  }

  const project = projects.find((item) => item.id === params.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const body = CreateProjectPanoramaBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Add a valid panorama image and check any supplied details." });
    return;
  }

  const { objectPath, label, location, date } = body.data;
  if (date && !isValidCalendarDate(date)) {
    res.status(400).json({ error: "Capture date must be a valid calendar date." });
    return;
  }
  try {
    const panorama = await panoramaStore.create({
      projectId: project.id,
      objectPath,
      label: label?.trim() || null,
      location: location?.trim() || null,
      date: date ?? null,
      ownerId: String((req as typeof req & { userId?: string }).userId),
    });
    res.status(201).json(CreateProjectPanoramaResponse.parse(panorama));
  } catch (error) {
    req.log.error({ err: error, projectId: project.id }, "Failed to persist project panorama");
    res.status(500).json({ error: "The uploaded panorama could not be saved. Try again." });
  }
});

router.patch("/projects/:projectId/panoramas/:panoramaId", async (req, res): Promise<void> => {
  const params = UpdateProjectPanoramaParams.safeParse(req.params);
  const body = UpdateProjectPanoramaBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Check the supplied panorama details." });
    return;
  }

  const project = projects.find((item) => item.id === params.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { label, location, date } = body.data;
  if (date && !isValidCalendarDate(date)) {
    res.status(400).json({ error: "Capture date must be a valid calendar date." });
    return;
  }

  try {
    const panorama = await panoramaStore.update({
      projectId: project.id,
      panoramaId: params.data.panoramaId,
      label: label?.trim() || null,
      location: location?.trim() || null,
      date: date || null,
    });
    if (!panorama) {
      res.status(404).json({ error: "Panorama not found" });
      return;
    }
    res.json(UpdateProjectPanoramaResponse.parse(panorama));
  } catch (error) {
    req.log.error(
      { err: error, projectId: project.id, panoramaId: params.data.panoramaId },
      "Failed to update project panorama",
    );
    res.status(500).json({ error: "The panorama details could not be saved. Try again." });
  }
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

router.get("/vendor-quotes", (req, res) => {
  const parsed = GetVendorQuotesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, projectId, vendorId, trade, status } = parsed.data;
  const normalizedSearch = search?.trim().toLowerCase();
  const result = vendorQuotes.filter((quote) =>
    (!projectId || quote.projectId === projectId) &&
    (!vendorId || quote.vendorId === vendorId) &&
    (!trade || quote.trade === trade) &&
    (!status || quote.status === status) &&
    (!normalizedSearch || `${quote.quoteNumber} ${quote.projectName} ${quote.vendorName} ${quote.trade} ${quote.notes}`.toLowerCase().includes(normalizedSearch)),
  );
  res.json(GetVendorQuotesResponse.parse(result));
});

router.post("/vendor-quotes", (req, res) => {
  const parsed = CreateVendorQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = projects.find((item) => item.id === parsed.data.projectId);
  const vendor = trades.find((item) => item.id === parsed.data.vendorId);
  if (!project || !vendor) {
    res.status(404).json({ error: !project ? "Project not found" : "Vendor not found" });
    return;
  }
  const issueDate = dateOnly(parsed.data.issueDate);
  const dueDate = dateOnly(parsed.data.dueDate);
  if (dueDate < issueDate) {
    res.status(400).json({ error: "Due date cannot be before issue date" });
    return;
  }
  const lineItems = calculateQuoteLineItems(parsed.data.lineItems);
  const now = new Date().toISOString();
  const quote = {
    ...parsed.data,
    id: `vq-${Date.now()}`,
    projectName: project.name,
    vendorName: vendor.companyName,
    trade: vendor.tradeType,
    issueDate,
    dueDate,
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.amount, 0),
    createdAt: now,
    updatedAt: now,
  };
  vendorQuotes = [quote, ...vendorQuotes];
  res.status(201).json(CreateVendorQuoteResponse.parse(quote));
});

router.get("/vendor-quotes/:quoteId", (req, res) => {
  const parsed = GetVendorQuoteParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const quote = vendorQuotes.find((item) => item.id === parsed.data.quoteId);
  if (!quote) {
    res.status(404).json({ error: "Vendor quote not found" });
    return;
  }
  res.json(GetVendorQuoteResponse.parse(quote));
});

router.patch("/vendor-quotes/:quoteId", (req, res) => {
  const params = UpdateVendorQuoteParams.safeParse(req.params);
  const body = UpdateVendorQuoteBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid vendor quote update" });
    return;
  }
  const index = vendorQuotes.findIndex((item) => item.id === params.data.quoteId);
  if (index === -1) {
    res.status(404).json({ error: "Vendor quote not found" });
    return;
  }
  const current = vendorQuotes[index];
  const projectId = body.data.projectId ?? current.projectId;
  const vendorId = body.data.vendorId ?? current.vendorId;
  const project = projects.find((item) => item.id === projectId);
  const vendor = trades.find((item) => item.id === vendorId);
  if (!project || !vendor) {
    res.status(404).json({ error: !project ? "Project not found" : "Vendor not found" });
    return;
  }
  const issueDate = dateOnly(body.data.issueDate ?? current.issueDate);
  const dueDate = dateOnly(body.data.dueDate ?? current.dueDate);
  if (dueDate < issueDate) {
    res.status(400).json({ error: "Due date cannot be before issue date" });
    return;
  }
  const lineItems = body.data.lineItems ? calculateQuoteLineItems(body.data.lineItems) : current.lineItems;
  const updated = {
    ...current,
    ...body.data,
    projectId,
    projectName: project.name,
    vendorId,
    vendorName: vendor.companyName,
    trade: vendor.tradeType,
    issueDate,
    dueDate,
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.amount, 0),
    updatedAt: new Date().toISOString(),
  };
  vendorQuotes[index] = updated;
  res.json(UpdateVendorQuoteResponse.parse(updated));
});

export default router;