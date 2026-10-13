import { useState, type ReactNode } from "react";
import {
  Activity as ActivityIcon, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays,
  Camera, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  ClipboardList, Clock3, Command, FileCheck2, FileText, Filter, HardHat, LayoutDashboard,
  List, MapPin, MessageSquare, MoreHorizontal, Plus, RotateCcw, Search, Send, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Users, Wallet, X,
} from "lucide-react";
import {
  cloneDemoData, type BoardStatus, type DemoData, type ModuleKey, type Project, type ProjectStatus,
} from "@/lib/demo-workspace-data";

type ProjectTab = "Overview" | "Board" | "Photos / 360s" | "Budget" | "Trades" | "Activity";
type Persona = "Morgan Reyes" | "Avery Chen" | "Jordan Blake" | "Elena Park" | "Riley Foster";
type Notice = { title: string; detail: string };

const navGroups = [
  { label: "Workspace", items: [
    { id: "command" as ModuleKey, label: "Command center", icon: LayoutDashboard },
    { id: "projects" as ModuleKey, label: "All projects", icon: BriefcaseBusiness },
    { id: "schedule" as ModuleKey, label: "Schedule", icon: CalendarDays },
  ] },
  { label: "Operations", items: [
    { id: "trades" as ModuleKey, label: "Trades & vendors", icon: HardHat },
    { id: "quotes" as ModuleKey, label: "Vendor quotes", icon: FileText },
    { id: "financials" as ModuleKey, label: "Financials", icon: Wallet },
    { id: "communications" as ModuleKey, label: "Communications", icon: MessageSquare },
  ] },
  { label: "Organization", items: [
    { id: "users" as ModuleKey, label: "Users & roles", icon: Users },
    { id: "profile" as ModuleKey, label: "Profile & preferences", icon: Settings2 },
  ] },
];
const projectTabs: ProjectTab[] = ["Overview", "Board", "Photos / 360s", "Budget", "Trades", "Activity"];
const boardStatuses: BoardStatus[] = ["To do", "In progress", "Review", "Done"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const compactMoney = (value: number) => value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(2)}m` : `$${Math.round(value / 1000)}k`;
const projectOf = (data: DemoData, id: string) => data.projects.find((project) => project.id === id);
const vendorOf = (data: DemoData, id: string) => data.vendors.find((vendor) => vendor.id === id);
const humanDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const entryPageHref = import.meta.env.BASE_URL;

function Button({ children, onClick, variant = "quiet", className = "", testId, title }: {
  children: ReactNode; onClick?: () => void; variant?: "quiet" | "gold" | "outline" | "danger";
  className?: string; testId: string; title?: string;
}) {
  const colors = variant === "gold" ? "bg-primary text-primary-foreground hover:brightness-110"
    : variant === "danger" ? "bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30"
      : variant === "outline" ? "border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";
  return <button type="button" title={title} data-testid={testId} onClick={onClick}
    className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition duration-150 active:scale-[.98] ${colors} ${className}`}>{children}</button>;
}

function StatusPill({ children }: { children: string }) {
  const style = children === "On track" || children === "Approved" || children === "Paid" || children === "Done" || children === "Preferred"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    : children === "At risk" || children === "Declined" ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
      : children === "Watch" || children === "Pending approval" || children === "Review" ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
        : "border-sidebar-border bg-sidebar-accent/70 text-sidebar-foreground/65";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />{children}</span>;
}

function SectionTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><div className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[.22em] text-primary">{eyebrow}</div>
      <h1 className="text-2xl font-bold tracking-[-.035em] text-sidebar-foreground sm:text-[29px]">{title}</h1>
      <p className="mt-1.5 text-xs text-sidebar-foreground/50">{detail}</p></div>{action}
  </div>;
}

function PhotoScene({ scene, title, className = "" }: { scene: string; title?: string; className?: string }) {
  const palette: Record<string, string> = {
    ridge: "from-[#7d9181] via-[#829082] to-[#c4b99d]",
    urban: "from-[#8b918b] via-[#777c78] to-[#c1b59e]",
    timber: "from-[#755b4a] via-[#966f51] to-[#c9a77d]",
    mesa: "from-[#a38c69] via-[#a5906f] to-[#d0c4a8]",
    interior: "from-[#8b795e] via-[#5c574b] to-[#c4b496]",
    panorama: "from-[#688079] via-[#a59170] to-[#746951]",
    structure: "from-[#667c81] via-[#758586] to-[#bcaa8c]",
  };
  return <div aria-label={title || "Construction site progress image"} data-testid={`photo-scene-${scene}`}
    className={`relative isolate overflow-hidden bg-gradient-to-br ${palette[scene] || palette.ridge} ${className}`}>
    <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(145deg, transparent 41%, rgba(27,34,34,.82) 42%, rgba(27,34,34,.82) 44%, transparent 45%), linear-gradient(90deg, transparent 0 12%, rgba(246,225,184,.36) 12.5% 13.2%, transparent 13.5% 36%, rgba(246,225,184,.36) 36.5% 37.2%, transparent 37.5%), linear-gradient(0deg, rgba(21,29,27,.7), transparent 42%), repeating-linear-gradient(90deg, transparent 0 42px, rgba(255,255,255,.11) 43px, transparent 44px)" }} />
    <div className="absolute -bottom-10 left-[14%] h-[46%] w-[76%] -skew-x-12 border-l border-t border-white/30 bg-gradient-to-br from-white/20 to-[#26332f]/75 shadow-2xl" />
    <div className="absolute bottom-0 left-0 right-0 h-[24%] bg-gradient-to-t from-[#171b19]/80 to-transparent" />
    <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
    {title && <div className="absolute bottom-3 left-3 right-3 text-xs font-semibold text-white drop-shadow">{title}</div>}
  </div>;
}

function PanoramaPreview({ scene, title }: { scene: string; title: string }) {
  const [heading, setHeading] = useState(0);
  const headings = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
  const sampleViews = [scene, "ridge", "interior", "structure", "timber", "urban", "mesa", "panorama"];
  const viewIndex = Math.round(heading / 45) % headings.length;
  const turn = (amount: number) => setHeading((current) => (current + amount + 360) % 360);

  return <div data-testid="panorama-viewer">
    <div className="relative overflow-hidden rounded-xl">
      <PhotoScene scene={sampleViews[viewIndex]} title={title} className="h-[min(52vh,420px)] transition-colors duration-300" />
      <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
        <span className="rounded-md border border-white/20 bg-black/45 px-2 py-1 font-mono text-[9px] text-white/90 backdrop-blur">360° SAMPLE VIEW</span>
        <span data-testid="text-panorama-heading" className="rounded-md border border-white/20 bg-black/45 px-2 py-1 font-mono text-[9px] text-white/90 backdrop-blur">{headings[viewIndex]} · {heading}°</span>
      </div>
      <button type="button" aria-label="Panorama left" data-testid="button-panorama-left" onClick={() => turn(-45)} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"><ChevronLeft size={17} /></button>
      <button type="button" aria-label="Panorama right" data-testid="button-panorama-right" onClick={() => turn(45)} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"><ChevronRight size={17} /></button>
    </div>
    <label className="mt-4 flex items-center gap-3 text-[10px] text-sidebar-foreground/50">Pan around this sample
      <input aria-label="Rotate sample panorama" data-testid="input-panorama-heading" type="range" min="0" max="315" step="45" value={heading} onChange={(event) => setHeading(Number(event.target.value))} className="min-w-0 flex-1 accent-primary" />
    </label>
    <p className="mt-2 text-[9px] text-sidebar-foreground/35">Viewpoint changes are a local illustration; no panorama file is uploaded or changed.</p>
  </div>;
}

export default function DemoWorkspace() {
  const [data, setData] = useState<DemoData>(() => cloneDemoData());
  const [module, setModule] = useState<ModuleKey>("command");
  const [activeProjectId, setActiveProjectId] = useState("riverstone");
  const [projectTab, setProjectTab] = useState<ProjectTab>("Overview");
  const [persona, setPersona] = useState<Persona>("Morgan Reyes");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("All status");
  const [projectView, setProjectView] = useState<"grid" | "list">("grid");
  const [scheduleMode, setScheduleMode] = useState<"Timeline" | "Calendar">("Timeline");
  const [quoteFilter, setQuoteFilter] = useState("All quotes");
  const [quoteEditing, setQuoteEditing] = useState<string | null>(null);
  const [quoteDraft, setQuoteDraft] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [channel, setChannel] = useState("Riverstone · Field team");
  const [showIntake, setShowIntake] = useState(false);
  const [intakeName, setIntakeName] = useState("");
  const [intakeClient, setIntakeClient] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<"All media" | "Photos" | "360°">("All media");
  const [directoryFilter, setDirectoryFilter] = useState("All trades");
  const [showSearch, setShowSearch] = useState(false);
  const [profilePrefs, setProfilePrefs] = useState({ weekly: true, mentions: true, digest: false });
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  const activeProject = projectOf(data, activeProjectId) || data.projects[0];
  const activeSample = data.team.find((member) => member.name === persona)!;
  const visibleNav = navGroups.map((group) => ({
    ...group,
    items: persona === "Jordan Blake" ? group.items.filter((item) => !["financials", "quotes", "users"].includes(item.id))
      : persona === "Elena Park" ? group.items.filter((item) => ["command", "projects", "communications", "profile"].includes(item.id))
        : persona !== "Morgan Reyes" ? group.items.filter((item) => item.id !== "users")
          : group.items,
  })).filter((group) => group.items.length);
  const allSearchables = [...data.projects.map((item) => ({ label: item.name, sub: item.client, go: () => openProject(item.id) })),
    ...data.vendors.map((item) => ({ label: item.name, sub: item.trade, go: () => setModule("trades") })),
    ...data.quotes.map((item) => ({ label: item.title, sub: "Vendor quote", go: () => setModule("quotes") }))];
  const searchResults = query.trim() ? allSearchables.filter((item) => `${item.label} ${item.sub}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : [];
  const filteredProjects = data.projects.filter((project) => (projectFilter === "All status" || project.status === projectFilter) && (!query || `${project.name} ${project.client} ${project.location}`.toLowerCase().includes(query.toLowerCase())));
  const openProject = (id: string) => { setActiveProjectId(id); setModule("project"); setProjectTab("Overview"); setQuery(""); setShowMobileNav(false); };
  const switchPersona = (next: Persona) => {
    setPersona(next);
    const hiddenForPersona = next === "Jordan Blake"
      ? ["financials", "quotes", "users"].includes(module)
      : next === "Elena Park"
        ? !["command", "projects", "communications", "profile"].includes(module)
        : next !== "Morgan Reyes" && module === "users";
    if (hiddenForPersona) setModule("command");
    flash("Sample persona changed", "Visibility is illustrative and remains local to this demo.");
  };
  const flash = (title: string, detail = "Demo only · this change is simulated locally.") => {
    setNotice({ title, detail });
    window.setTimeout(() => setNotice(null), 2800);
  };
  const resetDemo = () => {
    setData(cloneDemoData()); setModule("command"); setActiveProjectId("riverstone");
    setProjectTab("Overview"); setPersona("Morgan Reyes"); setQuery(""); setQuoteFilter("All quotes");
    setChannel("Riverstone · Field team"); setSelectedInvoice(null); setQuoteEditing(null); setQuoteDraft("");
    setProjectFilter("All status"); setProjectView("grid"); setScheduleMode("Timeline"); setDirectoryFilter("All trades");
    setGalleryFilter("All media"); setProfilePrefs({ weekly: true, mentions: true, digest: false });
    setMessageDraft(""); setShowIntake(false); setActivePhoto(null); setShowSearch(false); setShowMobileNav(false);
    setNotice({ title: "Demo reset", detail: "The original sample scenario has been restored." });
    window.setTimeout(() => setNotice(null), 2800);
  };
  const setBoardStatus = (cardId: string, status: BoardStatus) => {
    setData((current) => ({ ...current, board: current.board.map((card) => card.id === cardId ? { ...card, status } : card) }));
    flash("Task status updated");
  };
  const changeInvoice = (invoiceId: string, status: "Approved" | "Paid" | "Declined") => {
    setData((current) => ({ ...current, invoices: current.invoices.map((invoice) => invoice.id === invoiceId ? { ...invoice, status } : invoice) }));
    setSelectedInvoice(null); flash(`Invoice ${status.toLowerCase()}`);
  };
  const changeQuote = (quoteId: string, status: "Approved" | "Declined") => {
    setData((current) => ({ ...current, quotes: current.quotes.map((quote) => quote.id === quoteId ? { ...quote, status } : quote) }));
    flash(`Quote ${status.toLowerCase()}`);
  };
  const updateProjectStatus = (projectId: string, status: ProjectStatus) => {
    setData((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, status } : project) }));
    flash("Project status updated");
  };
  const addProject = () => {
    const name = intakeName.trim();
    if (!name) return;
    const project: Project = {
      id: `sample-${Date.now()}`, name, client: intakeClient.trim() || "New client", location: "Denver, CO",
      type: "New build", status: "On track", progress: 0, budget: 980000, spent: 0, start: "2025-07-01",
      finish: "2026-02-27", lead: persona, phase: "Project setup", accent: "from-[#637f79] to-[#2b4440]", image: "mesa",
    };
    setData((current) => ({ ...current, projects: [project, ...current.projects] }));
    setIntakeName(""); setIntakeClient(""); setShowIntake(false); flash("Sample project added");
  };
  const sendMessage = () => {
    if (!messageDraft.trim()) return;
    const message = { id: `m-${Date.now()}`, channel, author: persona, time: "Just now", body: messageDraft.trim() };
    setData((current) => ({ ...current, messages: [message, ...current.messages] }));
    setMessageDraft(""); flash("Message added to the sample thread");
  };
  const addSampleImport = () => {
    const found = data.projects.some((project) => project.id === "imported-sample");
    if (found) { flash("Sample import already added"); return; }
    const sample: Project = { id: "imported-sample", name: "Juniper Ridge Lodge", client: "Aspen Peak Group", location: "Nederland, CO", type: "Lodge renovation", status: "On track", progress: 8, budget: 2180000, spent: 174400, start: "2025-06-02", finish: "2026-01-16", lead: persona, phase: "Preconstruction", accent: "from-[#857b66] to-[#374540]", image: "ridge" };
    setData((current) => ({ ...current, projects: [sample, ...current.projects] }));
    flash("Sample import complete", "A local example project was added. No files or services were used.");
  };

  const headingMap: Record<ModuleKey, [string, string, string]> = {
    command: ["Operations overview", "Command center", "Tuesday, June 17 · Mountain region · All active work"],
    projects: ["Portfolio / active work", "All projects", "Four live builds across residential, civic, and hospitality."],
    project: ["Project file / " + activeProject.id.toUpperCase(), activeProject.name, `${activeProject.client} · ${activeProject.location} · Project lead ${activeProject.lead}`],
    schedule: ["Coordination / 30-day lookahead", "Schedule", "A shared view of critical work, handoffs, and upcoming inspections."],
    trades: ["Supply chain / directory", "Trades & vendors", "Trusted partners and active capacity across your project portfolio."],
    quotes: ["Procurement / bid review", "Vendor quotes", "Review scope, compare pricing, and record a local decision."],
    financials: ["Cost control / accounts payable", "Financials", "Invoices and approvals tied to live project budgets."],
    communications: ["Field network / project channels", "Communications", "Project conversations stay beside the work they coordinate."],
    users: ["Workspace / access control", "Users & roles", "Sample team access and visibility by role."],
    profile: ["Account / preferences", "Profile & preferences", "Personal workspace settings for this sample account."],
  };
  const [eyebrow, title, detail] = headingMap[module];

  const renderProjectGrid = (projects: Project[]) => projects.length ? <div className={projectView === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
    {projects.map((project) => <ProjectCard key={project.id} project={project} compact={projectView === "list"} onOpen={() => openProject(project.id)} />)}
  </div> : <EmptyState title="No projects match" detail="Try clearing the current filters or search." action={<Button testId="button-clear-project-filters" onClick={() => { setQuery(""); setProjectFilter("All status"); }}>Clear filters</Button>} />;

  function renderContent() {
    if (module === "command") return <CommandCenter data={data} persona={persona} onOpenProject={openProject}
      onNavigate={setModule} onInvoice={() => setModule("financials")} onQuote={() => setModule("quotes")} />;
    if (module === "projects") return <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="project-status-filter">Filter by project status</label>
          <select id="project-status-filter" data-testid="select-project-status" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="h-9 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-xs text-sidebar-foreground outline-none">
            {["All status", "On track", "Watch", "At risk"].map((value) => <option key={value}>{value}</option>)}
          </select>
          <span data-testid="text-project-count" className="font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/45">{filteredProjects.length} projects</span>
        </div>
        <Button testId="button-sample-import" variant="outline" onClick={addSampleImport}><FileText size={14} /> Import sample</Button>
        <Button testId="button-new-project" variant="gold" onClick={() => setShowIntake(true)}><Plus size={15} /> New project</Button>
        <div className="flex rounded-lg border border-sidebar-border bg-sidebar-accent/35 p-1">
          <Button testId="button-grid-view" className={`!h-7 !px-2 ${projectView === "grid" ? "!bg-primary/15 !text-primary" : ""}`} onClick={() => setProjectView("grid")} title="Grid view"><LayoutDashboard size={14} /></Button>
          <Button testId="button-list-view" className={`!h-7 !px-2 ${projectView === "list" ? "!bg-primary/15 !text-primary" : ""}`} onClick={() => setProjectView("list")} title="List view"><List size={14} /></Button>
        </div>
      </div>{renderProjectGrid(filteredProjects)}
    </div>;
    if (module === "project") return <ProjectDetail data={data} project={activeProject} tab={projectTab} setTab={setProjectTab}
      openProject={openProject} updateStatus={updateProjectStatus} setBoardStatus={setBoardStatus} setActivePhoto={setActivePhoto}
      galleryFilter={galleryFilter} setGalleryFilter={setGalleryFilter} />;
    if (module === "schedule") return <ScheduleView data={data} mode={scheduleMode} setMode={setScheduleMode} openProject={openProject} />;
    if (module === "trades") return <TradesView data={data} filter={directoryFilter} setFilter={setDirectoryFilter} />;
    if (module === "quotes") return <QuotesView data={data} filter={quoteFilter} setFilter={setQuoteFilter} editing={quoteEditing} setEditing={setQuoteEditing}
      draft={quoteDraft} setDraft={setQuoteDraft} onChange={changeQuote} flash={flash} onEdit={(id, amount) => {
        setData((current) => ({ ...current, quotes: current.quotes.map((quote) => quote.id === id ? { ...quote, amount } : quote) }));
      }} />;
    if (module === "financials") return <FinancialsView data={data} selectedInvoice={selectedInvoice} setSelectedInvoice={setSelectedInvoice} changeInvoice={changeInvoice} openProject={openProject} />;
    if (module === "communications") return <CommunicationsView data={data} persona={persona} channel={channel} setChannel={setChannel} draft={messageDraft} setDraft={setMessageDraft} send={sendMessage} flash={flash} openProject={openProject} />;
    if (module === "users") return <UsersView data={data} persona={persona} onPersona={switchPersona} flash={flash} />;
    return <ProfileView persona={persona} prefs={profilePrefs} setPrefs={setProfilePrefs} onReset={resetDemo} flash={flash} />;
  }

  return <div className="dark min-h-[100dvh] bg-[#10130f] text-sidebar-foreground" data-testid="demo-workspace">
    <div className="flex min-h-[100dvh]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-sidebar-border bg-[#11140f] transition-transform duration-200 md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 ${showMobileNav ? "translate-x-0" : "-translate-x-full"}`} data-testid="demo-sidebar">
        <div className="flex h-[68px] items-center gap-3 border-b border-sidebar-border px-5">
          <div className="grid h-8 w-8 place-items-center border border-primary/40 bg-primary/10 text-primary"><Command size={17} strokeWidth={1.7} /></div>
          <div className="leading-none"><div className="text-[15px] font-extrabold tracking-[.19em] text-sidebar-foreground">LUMINOVA</div><div className="mt-1.5 font-mono text-[8px] uppercase tracking-[.2em] text-sidebar-foreground/40">Construction / demo</div></div>
          <button type="button" aria-label="Close navigation" data-testid="button-close-navigation" onClick={() => setShowMobileNav(false)} className="ml-auto rounded-md p-1 text-sidebar-foreground/50 md:hidden"><X size={17} /></button>
        </div>
        <div className="border-b border-sidebar-border/70 px-4 py-3">
          <div className="flex items-center gap-3 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/25 p-2.5">
            <div className="grid h-8 w-8 place-items-center bg-primary/15 font-mono text-[10px] font-bold text-primary">LF</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">Luminova Fieldworks</p><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/40">Mountain region</p></div><ChevronDown size={14} className="text-sidebar-foreground/45" />
          </div>
        </div>
        <nav aria-label="Demo workspace navigation" className="flex-1 overflow-y-auto px-3 py-4">
          {visibleNav.map((group) => <div key={group.label} className="mb-5">
            <p className="mb-2 px-3 font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/35">{group.label}</p>
            <div className="space-y-0.5">{group.items.map(({ id, label, icon: Icon }) => <button key={id} type="button" data-testid={`nav-${id}`} aria-current={module === id ? "page" : undefined}
              onClick={() => { setModule(id); setShowMobileNav(false); }}
              className={`group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-xs transition-colors ${module === id ? "bg-primary/10 font-semibold text-primary" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"}`}>
              <Icon size={15} strokeWidth={1.8} /><span className="flex-1">{label}</span>{id === "financials" && data.invoices.filter((invoice) => invoice.status === "Pending approval").length > 0 && <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 font-mono text-[9px] text-amber-200">{data.invoices.filter((invoice) => invoice.status === "Pending approval").length}</span>}
            </button>)}</div>
          </div>)}
          <div className="border-t border-sidebar-border/70 pt-4">
            <p className="mb-2 px-3 font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/35">Pinned projects</p>
            {data.projects.slice(0, 3).map((project, index) => <button type="button" key={project.id} data-testid={`nav-project-${project.id}`} onClick={() => openProject(project.id)} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[11px] text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"><span className={`h-1.5 w-1.5 rounded-full ${["bg-primary", "bg-cyan-300", "bg-rose-300"][index]}`} /><span className="truncate">{project.name}</span></button>)}
          </div>
        </nav>
        <div className="border-t border-sidebar-border/70 p-3">
          <div className="flex items-center gap-2.5 rounded-lg p-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/35 bg-primary/10 text-[10px] font-bold text-primary">{activeSample.initials}</div>
            <div className="min-w-0 flex-1"><div data-testid="text-active-persona" className="truncate text-[11px] font-semibold">{persona}</div><div className="truncate text-[9px] text-sidebar-foreground/40">{activeSample.role}</div></div>
            <button type="button" aria-label="Open profile preferences" data-testid="button-open-profile" onClick={() => setModule("profile")} className="rounded-md p-1.5 text-sidebar-foreground/45 hover:bg-sidebar-accent"><Settings2 size={14} /></button>
          </div>
        </div>
      </aside>
      {showMobileNav && <button aria-label="Close navigation overlay" data-testid="button-navigation-overlay" onClick={() => setShowMobileNav(false)} className="fixed inset-0 z-30 bg-black/55 md:hidden" />}
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-sidebar-border/80 bg-[#10130f]/95 px-4 backdrop-blur-md sm:px-7">
          <button type="button" aria-label="Open navigation" data-testid="button-open-navigation" onClick={() => setShowMobileNav(true)} className="rounded-lg border border-sidebar-border p-2 text-sidebar-foreground/70 md:hidden"><List size={17} /></button>
          <div className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[.17em] text-sidebar-foreground/35 sm:flex"><span>Workspace</span><ChevronRight size={12} /><span className="text-sidebar-foreground/70">{title}</span></div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="relative hidden md:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40" />
              <input aria-label="Search projects, vendors, and quotes" data-testid="input-global-search" value={query} onFocus={() => setShowSearch(true)} onChange={(event) => { setQuery(event.target.value); setShowSearch(true); }}
                onKeyDown={(event) => { if (event.key === "Escape") { setShowSearch(false); setQuery(""); } }}
                placeholder="Search workspace…" className="h-9 w-[220px] rounded-lg border border-sidebar-border bg-sidebar-accent/30 pl-9 pr-9 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/35 outline-none transition focus:border-primary/45 lg:w-[270px]" />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-sidebar-foreground/35">⌘ K</kbd>
              {showSearch && query && <div className="absolute right-0 top-11 z-40 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-sidebar-border bg-[#1a1e18] p-1.5 shadow-2xl">
                {searchResults.length ? searchResults.map((result, index) => <button type="button" key={`${result.label}-${index}`} data-testid={`search-result-${index}`} onClick={() => { result.go(); setShowSearch(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-sidebar-accent"><Search size={13} className="text-primary" /><span className="min-w-0 flex-1 truncate text-xs">{result.label}</span><span className="text-[10px] text-sidebar-foreground/40">{result.sub}</span></button>)
                  : <p data-testid="text-search-empty" className="px-3 py-4 text-xs text-sidebar-foreground/45">No matching records in the sample workspace.</p>}
              </div>}
            </div>
            <button type="button" aria-label="Open workspace search" data-testid="button-mobile-search" onClick={() => setShowSearch((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-lg border border-sidebar-border text-sidebar-foreground/65 md:hidden"><Search size={15} /></button>
            {showSearch && <div className="absolute left-3 right-3 top-[62px] z-40 rounded-xl border border-sidebar-border bg-[#1a1e18] p-2 shadow-2xl md:hidden">
              <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40" /><input autoFocus aria-label="Search projects, vendors, and quotes" data-testid="input-mobile-global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace…" className="h-10 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 pl-9 pr-3 text-xs outline-none focus:border-primary/45" /></div>
              {query && <div className="mt-1 max-h-64 overflow-y-auto">{searchResults.length ? searchResults.map((result, index) => <button type="button" key={`${result.label}-${index}`} data-testid={`mobile-search-result-${index}`} onClick={() => { result.go(); setShowSearch(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-sidebar-accent"><Search size={13} className="text-primary" /><span className="min-w-0 flex-1 truncate text-xs">{result.label}</span><span className="text-[10px] text-sidebar-foreground/40">{result.sub}</span></button>) : <p className="px-3 py-4 text-xs text-sidebar-foreground/45">No matching records in the sample workspace.</p>}</div>}
            </div>}
            <select aria-label="Switch sample persona" data-testid="select-persona" value={persona} onChange={(event) => switchPersona(event.target.value as Persona)}
              className="h-9 max-w-[142px] rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-2 text-[10px] text-sidebar-foreground outline-none sm:max-w-[174px] sm:px-3 sm:text-xs">
              {data.team.map((member) => <option key={member.id} value={member.name}>{member.name} · {member.access}</option>)}
            </select>
            <Button testId="button-reset-demo" variant="outline" className="!h-9 !px-2.5 sm:!px-3" onClick={resetDemo}><RotateCcw size={13} /><span className="hidden sm:inline">Reset demo</span></Button>
            <a href={entryPageHref} data-testid="link-exit-demo" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold text-sidebar-foreground/55 transition hover:bg-sidebar-accent/70 hover:text-sidebar-foreground sm:px-3" title="Return to the Luminova entry page"><ArrowUpRight size={13} /><span className="hidden sm:inline">Exit demo</span></a>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-7 sm:px-7 lg:px-9">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/[.045] px-3 py-2.5 text-[10px] text-sidebar-foreground/55" data-testid="demo-sandbox-banner">
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /><strong className="font-semibold text-primary">SANDBOX</strong><span>Sample persona: <b className="text-sidebar-foreground/80">{persona}</b>. Changes are local and simulated; nothing is sent or saved.</span></span>
            <span className="hidden font-mono uppercase tracking-widest text-sidebar-foreground/35 md:inline">Demo only · resets on reload</span>
          </div>
          <SectionTitle eyebrow={eyebrow} title={title} detail={detail} action={module === "project" ? <div className="flex items-center gap-2"><Button testId="button-previous-project" onClick={() => { const i = data.projects.findIndex((p) => p.id === activeProjectId); openProject(data.projects[(i + data.projects.length - 1) % data.projects.length].id); }} title="Previous project"><ChevronLeft size={15} /></Button><Button testId="button-next-project" onClick={() => { const i = data.projects.findIndex((p) => p.id === activeProjectId); openProject(data.projects[(i + 1) % data.projects.length].id); }} title="Next project"><ChevronRight size={15} /></Button></div> : null} />
          <div key={`${module}-${projectTab}`} className="animate-in fade-in slide-in-from-bottom-1 duration-300">{renderContent()}</div>
          <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-sidebar-border/60 pt-4 font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/30">
            <span>Luminova Fieldworks · Construction operations preview</span><span className="flex items-center gap-2"><ShieldCheck size={12} /> Sandbox session · no backend connection</span>
          </footer>
        </div>
      </main>
    </div>
    {showIntake && <Modal title="Start a sample project" eyebrow="Project intake / local only" close={() => setShowIntake(false)}>
      <p className="mb-5 text-xs leading-5 text-sidebar-foreground/55">Add a project to this browser session to explore portfolio workflows. Nothing is created outside this demo.</p>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60" htmlFor="intake-name">Project name</label>
      <input id="intake-name" data-testid="input-intake-project-name" value={intakeName} onChange={(event) => setIntakeName(event.target.value)} placeholder="e.g. Aspen Ridge Residence" className="mb-4 h-10 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 text-sm outline-none focus:border-primary/50" />
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60" htmlFor="intake-client">Client</label>
      <input id="intake-client" data-testid="input-intake-client" value={intakeClient} onChange={(event) => setIntakeClient(event.target.value)} placeholder="Client or owner" className="h-10 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 text-sm outline-none focus:border-primary/50" />
      <div className="mt-6 flex justify-end gap-2"><Button testId="button-cancel-intake" variant="outline" onClick={() => setShowIntake(false)}>Cancel</Button><Button testId="button-create-sample-project" variant="gold" onClick={addProject}><Plus size={14} /> Add sample</Button></div>
    </Modal>}
    {selectedInvoice && <Modal title="Invoice approval" eyebrow="Financials / sample transaction" close={() => setSelectedInvoice(null)}>
      {(() => { const invoice = data.invoices.find((item) => item.id === selectedInvoice); if (!invoice) return null; return <div>
        <p className="text-sm font-semibold">{invoice.number} · {vendorOf(data, invoice.vendorId)?.name}</p><p className="mt-1 text-xs text-sidebar-foreground/50">{projectOf(data, invoice.projectId)?.name} · {invoice.description}</p>
        <div className="my-5 flex items-end justify-between border-y border-sidebar-border py-4"><span className="text-xs text-sidebar-foreground/50">Invoice amount</span><strong className="font-mono text-xl">{money(invoice.amount)}</strong></div>
        <p className="text-[10px] text-sidebar-foreground/40">Review this sample invoice and record a local decision.</p>
        <div className="mt-5 flex justify-end gap-2"><Button testId="button-decline-invoice" variant="danger" onClick={() => changeInvoice(invoice.id, "Declined")}>Decline</Button><Button testId="button-approve-invoice" variant="gold" onClick={() => changeInvoice(invoice.id, "Approved")}><Check size={14} /> Approve invoice</Button></div>
      </div>; })()}
    </Modal>}
    {activePhoto && <Modal title="Site record" eyebrow="Field documentation / sample media" close={() => setActivePhoto(null)} wide>
      {(() => { const photo = data.photos.find((item) => item.id === activePhoto); if (!photo) return null; return <div>{photo.kind === "360°" ? <PanoramaPreview key={photo.id} scene={photo.scene} title={photo.title} /> : <PhotoScene scene={photo.scene} title={photo.title} className="h-[min(58vh,460px)] rounded-xl" />}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">{photo.title}</p><p className="mt-1 text-xs text-sidebar-foreground/45">{projectOf(data, photo.projectId)?.name} · {photo.date} · {photo.author}</p></div><StatusPill>{photo.kind}</StatusPill></div></div>; })()}
    </Modal>}
    {notice && <div role="status" aria-live="polite" data-testid="demo-toast" className="fixed bottom-5 right-5 z-[70] flex max-w-sm items-start gap-3 rounded-xl border border-primary/30 bg-[#1c2119] px-4 py-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Check size={13} /></div><div><p className="text-xs font-semibold">{notice.title}</p><p className="mt-1 text-[10px] text-sidebar-foreground/50">{notice.detail}</p></div><button type="button" aria-label="Dismiss notification" data-testid="button-dismiss-toast" onClick={() => setNotice(null)} className="ml-1 text-sidebar-foreground/40 hover:text-sidebar-foreground"><X size={13} /></button>
    </div>}
  </div>;
}

function ProjectCard({ project, compact, onOpen }: { project: Project; compact: boolean; onOpen: () => void }) {
  const spentPct = Math.min(100, Math.round((project.spent / project.budget) * 100));
  if (compact) return <div data-testid={`project-row-${project.id}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-sidebar-border/75 bg-[#171b15] p-3 transition hover:border-primary/35 sm:flex-nowrap">
    <button type="button" onClick={onOpen} data-testid={`button-open-project-${project.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-left"><div className={`h-12 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br ${project.accent}`}><PhotoScene scene={project.image} className="h-full opacity-70" /></div><div className="min-w-0"><p className="truncate text-xs font-bold">{project.name}</p><p className="mt-1 truncate text-[10px] text-sidebar-foreground/45">{project.client} · {project.location}</p></div></button>
    <div className="hidden min-w-[150px] flex-1 sm:block"><div className="mb-1.5 flex justify-between text-[10px]"><span className="text-sidebar-foreground/45">{project.phase}</span><span className="font-mono">{project.progress}%</span></div><Progress value={project.progress} /></div><StatusPill>{project.status}</StatusPill><span className="w-20 text-right font-mono text-[11px]">{compactMoney(project.budget)}</span>
  </div>;
  return <button type="button" data-testid={`card-project-${project.id}`} onClick={onOpen} className="group overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15] text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20">
    <div className={`relative h-36 overflow-hidden bg-gradient-to-br ${project.accent}`}><PhotoScene scene={project.image} className="h-full transition duration-500 group-hover:scale-[1.03]" /><div className="absolute left-3 top-3"><StatusPill>{project.status}</StatusPill></div><div className="absolute bottom-3 right-3 rounded-md border border-white/20 bg-black/25 px-2 py-1 font-mono text-[9px] text-white/85 backdrop-blur">{project.type}</div></div>
    <div className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold tracking-tight">{project.name}</h3><p className="mt-1 truncate text-[10px] text-sidebar-foreground/45">{project.client} <span className="px-1 text-sidebar-foreground/20">/</span>{project.location}</p></div><span className="font-mono text-[9px] text-sidebar-foreground/35">{project.id.toUpperCase()}</span></div>
      <div className="mt-4 flex items-center justify-between text-[10px]"><span className="text-sidebar-foreground/48">{project.phase}</span><span className="font-mono">{project.progress}%</span></div><div className="mt-2"><Progress value={project.progress} /></div>
      <div className="mt-4 flex items-center justify-between border-t border-sidebar-border/70 pt-3"><div><p className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Budget</p><p className="mt-1 text-xs font-semibold">{compactMoney(project.budget)}</p></div><div className="text-right"><p className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Spent</p><p className="mt-1 text-xs font-semibold">{compactMoney(project.spent)}</p></div><div className="text-right"><p className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Finish</p><p className="mt-1 text-xs font-semibold">{humanDate(project.finish)}</p></div></div>
    </div>
  </button>;
}

function Progress({ value }: { value: number }) {
  return <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} data-testid={`progress-${value}`} className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent"><div className="h-full rounded-full bg-gradient-to-r from-primary/75 to-primary transition-all duration-500" style={{ width: `${value}%` }} /></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-sidebar-border bg-sidebar-accent/15 p-8 text-center"><div><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-sidebar-border bg-sidebar-accent/45 text-primary"><ClipboardList size={18} /></div><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-sidebar-foreground/45">{detail}</p>{action && <div className="mt-4">{action}</div>}</div></div>;
}

function Metric({ label, value, delta, icon: Icon, tone = "gold" }: { label: string; value: string; delta: string; icon: typeof ActivityIcon; tone?: string }) {
  return <div className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/45">{label}</span><Icon size={15} className={tone === "cyan" ? "text-cyan-200/80" : tone === "rose" ? "text-rose-300/80" : "text-primary/85"} /></div><div className="mt-3 flex items-end justify-between gap-2"><strong className="font-mono text-[24px] font-medium tracking-tight">{value}</strong><span className="mb-1 text-[9px] text-sidebar-foreground/40">{delta}</span></div></div>;
}

function CommandCenter({ data, persona, onOpenProject, onNavigate, onInvoice, onQuote }: {
  data: DemoData; persona: string; onOpenProject: (id: string) => void; onNavigate: (id: ModuleKey) => void; onInvoice: () => void; onQuote: () => void;
}) {
  const pendingInvoices = data.invoices.filter((invoice) => invoice.status === "Pending approval");
  const reviewQuotes = data.quotes.filter((quote) => quote.status === "Review");
  const upcoming = data.board.filter((card) => card.status !== "Done").slice(0, 4);
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Active projects" value={String(data.projects.length).padStart(2, "0")} delta="4 locations" icon={BriefcaseBusiness} />
      <Metric label="Portfolio at completion" value={`${Math.round(data.projects.reduce((sum, p) => sum + p.progress, 0) / data.projects.length)}%`} delta="weighted progress" icon={ActivityIcon} tone="cyan" />
      <Metric label="Committed budget" value={compactMoney(data.projects.reduce((sum, p) => sum + p.budget, 0))} delta={`${compactMoney(data.projects.reduce((sum, p) => sum + p.spent, 0))} spent`} icon={CircleDollarSign} />
      <Metric label="Decisions needed" value={String(pendingInvoices.length + reviewQuotes.length).padStart(2, "0")} delta={`${pendingInvoices.length} invoice · ${reviewQuotes.length} quote`} icon={Clock3} tone="rose" />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15]">
        <div className="flex items-center justify-between border-b border-sidebar-border/70 px-4 py-3.5"><div><h2 className="text-xs font-bold">Portfolio pulse</h2><p className="mt-1 text-[10px] text-sidebar-foreground/40">Live view · sample project mix</p></div><button type="button" data-testid="button-command-all-projects" onClick={() => onNavigate("projects")} className="text-[10px] font-semibold text-primary hover:text-primary/75">All projects <ChevronRight size={12} className="inline" /></button></div>
        <div className="space-y-1 p-2">{data.projects.map((project) => <button key={project.id} type="button" data-testid={`command-project-${project.id}`} onClick={() => onOpenProject(project.id)} className="group flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-sidebar-accent/45">
          <div className={`h-11 w-14 shrink-0 overflow-hidden rounded-md bg-gradient-to-br ${project.accent}`}><PhotoScene scene={project.image} className="h-full opacity-75" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-xs font-semibold">{project.name}</span><StatusPill>{project.status}</StatusPill></div><p className="mt-1 truncate text-[10px] text-sidebar-foreground/40">{project.phase} · {project.lead}</p></div>
          <div className="hidden w-28 sm:block"><div className="mb-1 flex justify-between font-mono text-[9px] text-sidebar-foreground/50"><span>{compactMoney(project.spent)}</span><span>{project.progress}%</span></div><Progress value={project.progress} /></div><ChevronRight size={14} className="text-sidebar-foreground/30 group-hover:text-primary" />
        </button>)}</div>
      </section>
      <div className="space-y-5">
        <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15]">
          <div className="flex items-center justify-between border-b border-sidebar-border/70 px-4 py-3.5"><div><h2 className="text-xs font-bold">Needs your attention</h2><p className="mt-1 text-[10px] text-sidebar-foreground/40">Decisions that keep work moving</p></div><span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary">{pendingInvoices.length + reviewQuotes.length}</span></div>
          <div className="divide-y divide-sidebar-border/55">
            {pendingInvoices.slice(0, 2).map((invoice) => <button type="button" key={invoice.id} data-testid={`attention-invoice-${invoice.id}`} onClick={onInvoice} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sidebar-accent/35"><div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><FileCheck2 size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{invoice.number} · {vendorOf(data, invoice.vendorId)?.name}</p><p className="mt-1 text-[10px] text-sidebar-foreground/40">{invoice.description}</p></div><span className="font-mono text-[11px]">{compactMoney(invoice.amount)}</span></button>)}
            {reviewQuotes.slice(0, 2).map((quote) => <button type="button" key={quote.id} data-testid={`attention-quote-${quote.id}`} onClick={onQuote} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sidebar-accent/35"><div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><FileText size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{quote.title}</p><p className="mt-1 text-[10px] text-sidebar-foreground/40">{vendorOf(data, quote.vendorId)?.name}</p></div><span className="font-mono text-[11px]">{compactMoney(quote.amount)}</span></button>)}
            {!pendingInvoices.length && !reviewQuotes.length && <p className="p-5 text-xs text-sidebar-foreground/45">You’re clear. No decisions waiting.</p>}
          </div>
        </section>
        <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15]">
          <div className="flex items-center justify-between border-b border-sidebar-border/70 px-4 py-3"><div><h2 className="text-xs font-bold">Next on site</h2><p className="mt-1 text-[10px] text-sidebar-foreground/40">Assigned work · {persona}</p></div><button type="button" data-testid="button-open-schedule" onClick={() => onNavigate("schedule")} className="text-[10px] font-semibold text-primary">Schedule</button></div>
          <div className="divide-y divide-sidebar-border/55">{upcoming.map((card) => <div key={card.id} data-testid={`upcoming-task-${card.id}`} className="flex items-center gap-3 px-4 py-2.5"><div className="grid h-7 w-7 place-items-center rounded-lg border border-sidebar-border font-mono text-[9px] text-sidebar-foreground/45">{card.due.split(" ")[1]}</div><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{card.title}</p><p className="mt-0.5 text-[9px] text-sidebar-foreground/40">{projectOf(data, card.projectId)?.name} · {card.trade}</p></div><span className="text-[9px] text-sidebar-foreground/40">{card.due}</span></div>)}</div>
        </section>
      </div>
    </div>
    <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xs font-bold">Project portfolio</h2><p className="mt-1 text-[10px] text-sidebar-foreground/40">Jump straight into the job file.</p></div><Button testId="button-view-all-projects" onClick={() => onNavigate("projects")}>View portfolio <ArrowUpRight size={13} /></Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.projects.map((project) => <button key={project.id} type="button" data-testid={`portfolio-card-${project.id}`} onClick={() => onOpenProject(project.id)} className="overflow-hidden rounded-xl border border-sidebar-border/75 bg-[#171b15] text-left transition hover:border-primary/40">
        <div className="relative h-24 overflow-hidden"><PhotoScene scene={project.image} className="h-full" /><div className="absolute left-2 top-2"><StatusPill>{project.status}</StatusPill></div></div><div className="p-3"><p className="truncate text-xs font-bold">{project.name}</p><div className="mt-2 flex items-center justify-between text-[9px] text-sidebar-foreground/45"><span>{project.phase}</span><span className="font-mono text-sidebar-foreground/75">{project.progress}%</span></div><div className="mt-2"><Progress value={project.progress} /></div></div>
      </button>)}</div>
    </section>
  </div>;
}

function Modal({ title, eyebrow, close, children, wide = false }: { title: string; eyebrow: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return <div role="presentation" className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} data-testid="demo-modal" className={`my-auto w-full rounded-2xl border border-sidebar-border bg-[#1a1e18] p-5 shadow-2xl sm:p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-1.5 font-mono text-[9px] uppercase tracking-[.2em] text-primary">{eyebrow}</p><h2 className="text-lg font-bold tracking-tight">{title}</h2></div><button type="button" aria-label="Close dialog" data-testid="button-close-dialog" onClick={close} className="rounded-lg p-1.5 text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground"><X size={17} /></button></div>
      {children}
    </section>
  </div>;
}

function ProjectDetail({ data, project, tab, setTab, openProject, updateStatus, setBoardStatus, setActivePhoto, galleryFilter, setGalleryFilter }: {
  data: DemoData; project: Project; tab: ProjectTab; setTab: (tab: ProjectTab) => void; openProject: (id: string) => void;
  updateStatus: (id: string, status: ProjectStatus) => void; setBoardStatus: (id: string, status: BoardStatus) => void; setActivePhoto: (id: string) => void;
  galleryFilter: "All media" | "Photos" | "360°"; setGalleryFilter: (filter: "All media" | "Photos" | "360°") => void;
}) {
  const projectBoard = data.board.filter((card) => card.projectId === project.id);
  const photos = data.photos.filter((photo) => photo.projectId === project.id);
  const displayedPhotos = photos.filter((photo) => galleryFilter === "All media" || (galleryFilter === "Photos" ? photo.kind === "Photo" : photo.kind === "360°"));
  const projectQuotes = data.quotes.filter((quote) => quote.projectId === project.id);
  const projectInvoices = data.invoices.filter((invoice) => invoice.projectId === project.id);
  const projectActivity = data.activity.filter((entry) => entry.projectId === project.id);
  const projectTrades = [...new Set([...projectBoard.map((card) => card.trade), ...projectQuotes.map((quote) => vendorOf(data, quote.vendorId)?.trade || "")])].filter(Boolean);
  const costItems = [
    ...projectQuotes.map((quote) => ({ label: quote.title, sub: `${vendorOf(data, quote.vendorId)?.name} · quote`, amount: quote.amount, status: quote.status })),
    ...projectInvoices.map((invoice) => ({ label: invoice.number, sub: `${vendorOf(data, invoice.vendorId)?.name} · invoice`, amount: invoice.amount, status: invoice.status })),
  ].slice(0, 4);
  return <div>
    <section className="relative mb-5 overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15]">
      <div className="grid lg:grid-cols-[1.25fr_1fr]">
        <div className="relative min-h-[210px] overflow-hidden"><PhotoScene scene={project.image} className="absolute inset-0 h-full w-full" /><div className="absolute inset-0 bg-gradient-to-r from-[#11140f]/85 via-[#11140f]/35 to-transparent" /><div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#11140f]/75 to-transparent" />
          <div className="absolute bottom-5 left-5 right-4 sm:left-7"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill>{project.status}</StatusPill><span className="font-mono text-[9px] uppercase tracking-widest text-white/55">{project.id} / live job</span></div><h2 className="text-2xl font-bold tracking-tight text-white sm:text-[28px]">{project.name}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-white/65"><MapPin size={12} />{project.location} <span className="px-1 text-white/30">·</span>{project.type}</p></div>
        </div>
        <div className="flex flex-col justify-between p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/40">Delivery snapshot</p><p className="mt-2 text-sm font-semibold">{project.phase}</p><p className="mt-1 text-[10px] text-sidebar-foreground/45">Project lead · {project.lead}</p></div><label className="flex flex-col gap-1 text-[9px] uppercase tracking-wider text-sidebar-foreground/40">Health<select aria-label={`Change ${project.name} status`} data-testid={`select-project-health-${project.id}`} value={project.status} onChange={(event) => updateStatus(project.id, event.target.value as ProjectStatus)} className="h-8 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-2 text-[10px] font-semibold normal-case tracking-normal text-sidebar-foreground outline-none">{(["On track", "Watch", "At risk"] as ProjectStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label></div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-sidebar-border/60 pt-4"><div><p className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Progress</p><p className="mt-1.5 font-mono text-lg">{project.progress}%</p><Progress value={project.progress} /></div><div><p className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Spent / budget</p><p className="mt-1.5 font-mono text-sm">{compactMoney(project.spent)}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">of {compactMoney(project.budget)}</p></div><div><p className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Target finish</p><p className="mt-1.5 font-mono text-sm">{humanDate(project.finish)}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">Started {humanDate(project.start)}</p></div></div>
        </div>
      </div>
    </section>
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-sidebar-border/70" role="tablist" aria-label="Project detail sections">
      {projectTabs.map((name) => <button type="button" role="tab" aria-selected={tab === name} key={name} data-testid={`tab-project-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`} onClick={() => setTab(name)} className={`relative whitespace-nowrap px-3 py-3 text-[11px] font-semibold transition ${tab === name ? "text-primary" : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80"}`}>{name}{tab === name && <span className="absolute inset-x-2 bottom-0 h-[2px] bg-primary" />}</button>)}
    </div>
    {tab === "Overview" && <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-5">
        <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4 sm:p-5"><div className="mb-4 flex items-start justify-between"><div><h3 className="text-xs font-bold">Progress & exposure</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Cost-to-complete at current pace</p></div><span className="font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/35">This month</span></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 p-4"><div className="flex justify-between text-[10px]"><span className="text-sidebar-foreground/50">Physical completion</span><span>{project.progress}%</span></div><div className="mt-3"><Progress value={project.progress} /></div><div className="mt-4 flex justify-between text-[9px] text-sidebar-foreground/40"><span>Start · {humanDate(project.start)}</span><span>Finish · {humanDate(project.finish)}</span></div></div>
            <div className="rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 p-4"><div className="flex justify-between text-[10px]"><span className="text-sidebar-foreground/50">Budget utilization</span><span>{Math.round(project.spent / project.budget * 100)}%</span></div><div className="mt-3"><Progress value={Math.round(project.spent / project.budget * 100)} /></div><div className="mt-4 flex justify-between text-[9px] text-sidebar-foreground/40"><span>Spent · {money(project.spent)}</span><span>Remaining · {money(project.budget - project.spent)}</span></div></div>
          </div>
        </section>
        <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15]"><div className="flex items-center justify-between border-b border-sidebar-border/60 px-4 py-3"><div><h3 className="text-xs font-bold">Latest site records</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Field photos and panorama captures</p></div><button type="button" data-testid="button-view-project-photos" onClick={() => setTab("Photos / 360s")} className="text-[10px] font-semibold text-primary">View gallery <ChevronRight size={12} className="inline" /></button></div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">{photos.slice(0, 3).map((photo) => <button type="button" key={photo.id} data-testid={`overview-photo-${photo.id}`} onClick={() => setActivePhoto(photo.id)} className="group relative overflow-hidden rounded-lg text-left"><PhotoScene scene={photo.scene} className="h-28 transition group-hover:scale-[1.03]" /><span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-1 font-mono text-[8px] uppercase text-white/85">{photo.kind}</span><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-[9px] font-semibold text-white">{photo.title}</span></button>)}</div>
        </section>
      </div>
      <div className="space-y-5">
        <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15]"><div className="border-b border-sidebar-border/60 px-4 py-3"><h3 className="text-xs font-bold">Work in motion</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">{projectBoard.filter((card) => card.status !== "Done").length} open tasks on this job</p></div><div className="divide-y divide-sidebar-border/50">{projectBoard.slice(0, 4).map((card) => <div key={card.id} className="flex items-start gap-3 px-4 py-3"><span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${card.status === "Review" ? "bg-amber-300" : card.status === "Done" ? "bg-emerald-300" : "bg-primary"}`} /><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold">{card.title}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">{card.trade} · {card.assignee}</p></div><span className="font-mono text-[9px] text-sidebar-foreground/40">{card.due}</span></div>)}</div><div className="border-t border-sidebar-border/60 p-2"><button type="button" data-testid="button-overview-board" onClick={() => setTab("Board")} className="w-full rounded-lg py-2 text-[10px] font-semibold text-primary hover:bg-sidebar-accent/40">Open project board</button></div></section>
        <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15]"><div className="border-b border-sidebar-border/60 px-4 py-3"><h3 className="text-xs font-bold">Procurement & cost activity</h3></div>{costItems.map((item, index) => <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-sidebar-border/40 px-4 py-3 last:border-0"><div className="grid h-7 w-7 place-items-center rounded bg-primary/10 text-primary"><FileText size={13} /></div><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{item.label}</p><p className="mt-1 truncate text-[9px] text-sidebar-foreground/40">{item.sub}</p></div><div className="text-right"><p className="font-mono text-[10px]">{compactMoney(item.amount)}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">{item.status}</p></div></div>)}</section>
      </div>
    </div>}
    {tab === "Board" && <ProjectBoard data={data} cards={projectBoard} onStatus={setBoardStatus} />}
    {tab === "Photos / 360s" && <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p data-testid="text-photo-count" className="text-xs text-sidebar-foreground/45">Captured records · {displayedPhotos.length} items</p><div className="flex items-center gap-2"><div className="flex rounded-lg border border-sidebar-border p-1">{(["All media", "Photos", "360°"] as const).map((filter) => <button type="button" key={filter} data-testid={`button-photo-filter-${filter.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`} aria-pressed={galleryFilter === filter} onClick={() => setGalleryFilter(filter)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-semibold ${galleryFilter === filter ? "bg-primary/15 text-primary" : "text-sidebar-foreground/45 hover:text-sidebar-foreground"}`}>{filter}</button>)}</div><span className="data-chip"><Camera size={11} /> All uploads simulated</span></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{displayedPhotos.map((photo) => <button key={photo.id} type="button" data-testid={`photo-card-${photo.id}`} onClick={() => setActivePhoto(photo.id)} className="group overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15] text-left"><div className="relative"><PhotoScene scene={photo.scene} className="h-44 transition duration-300 group-hover:scale-[1.025]" /><span className="absolute left-3 top-3 rounded-md border border-white/20 bg-black/45 px-2 py-1 font-mono text-[9px] text-white">{photo.kind === "360°" ? "360° PANORAMA" : "SITE PHOTO"}</span><span className="absolute bottom-3 right-3 rounded-md bg-black/45 px-2 py-1 font-mono text-[9px] text-white/75">{photo.date}</span></div><div className="flex items-center justify-between gap-2 p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{photo.title}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">Captured by {photo.author}</p></div><ArrowUpRight size={14} className="shrink-0 text-sidebar-foreground/35 group-hover:text-primary" /></div></button>)}</div></div>}
    {tab === "Budget" && <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><div className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-5"><p className="font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/40">Current cost position</p><div className="mt-4 flex items-end justify-between"><strong className="font-mono text-3xl">{money(project.spent)}</strong><span className="mb-1 text-xs text-sidebar-foreground/45">of {money(project.budget)}</span></div><div className="mt-4"><Progress value={Math.round(project.spent / project.budget * 100)} /></div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-sidebar-border/60 pt-4"><div><p className="text-[9px] text-sidebar-foreground/40">Committed</p><p className="mt-1 font-mono text-xs">{money(Math.round(project.spent * 1.16))}</p></div><div><p className="text-[9px] text-sidebar-foreground/40">Forecast</p><p className="mt-1 font-mono text-xs">{money(Math.round(project.budget * 0.96))}</p></div><div><p className="text-[9px] text-sidebar-foreground/40">Remaining</p><p className="mt-1 font-mono text-xs text-emerald-300">{money(project.budget - project.spent)}</p></div></div></div><div className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-5"><h3 className="text-xs font-bold">Budget distribution</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Planned allocation · illustrative</p>{[["Structure", 35], ["Interior & finishes", 28], ["Mechanical / electrical", 21], ["Site & general conditions", 16]].map(([label, value], index) => <div key={label} className="mt-4"><div className="mb-1.5 flex justify-between text-[10px]"><span>{label}</span><span className="font-mono text-sidebar-foreground/55">{value}%</span></div><Progress value={Number(value)} /></div>)}</div>
      <div className="lg:col-span-2"><h3 className="mb-3 text-xs font-bold">Recent project costs</h3><div className="overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15]">{projectInvoices.length ? projectInvoices.map((invoice) => <div key={invoice.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-sidebar-border/50 px-4 py-3 last:border-0 sm:grid-cols-[1fr_1fr_auto_auto]"><div><p className="text-xs font-semibold">{invoice.description}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">{vendorOf(data, invoice.vendorId)?.name} · {invoice.number}</p></div><span className="hidden text-[10px] text-sidebar-foreground/45 sm:block">{invoice.date}</span><StatusPill>{invoice.status}</StatusPill><span className="font-mono text-xs">{money(invoice.amount)}</span></div>) : <p className="p-5 text-xs text-sidebar-foreground/45">No invoices recorded for this job yet.</p>}</div></div></div>}
    {tab === "Trades" && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{projectTrades.map((trade) => { const vendor = data.vendors.find((item) => item.trade === trade); const assigned = projectBoard.filter((card) => card.trade === trade).length; return <div key={trade} className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><HardHat size={17} /></span><span className="font-mono text-[9px] text-sidebar-foreground/40">{assigned} task{assigned === 1 ? "" : "s"}</span></div><h3 className="mt-3 text-sm font-bold">{trade}</h3><p className="mt-1 text-[10px] text-sidebar-foreground/45">{vendor?.name || "Assigned trade partner"}</p><div className="mt-4 border-t border-sidebar-border/55 pt-3 text-[10px] text-sidebar-foreground/55">{vendor ? `${vendor.contact} · ${vendor.phone}` : "No directory vendor linked yet"}</div></div>; })}</div>}
    {tab === "Activity" && <div className="max-w-3xl rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><h3 className="text-xs font-bold">Project activity</h3><span className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/35">Most recent first</span></div><div className="space-y-0">{projectActivity.length ? projectActivity.map((entry, index) => <div key={entry.id} className="relative flex gap-3 pb-6 last:pb-0"><div className="relative flex w-7 shrink-0 justify-center"><span className="z-10 grid h-7 w-7 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary"><ActivityIcon size={12} /></span>{index < projectActivity.length - 1 && <span className="absolute top-7 h-full w-px bg-sidebar-border" />}</div><div className="min-w-0 flex-1 pt-1"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold">{entry.title}</p><span className="font-mono text-[9px] text-sidebar-foreground/40">{entry.time}</span></div><p className="mt-1 text-[10px] text-sidebar-foreground/50">{entry.detail}</p><p className="mt-2 text-[9px] text-sidebar-foreground/35">by {entry.author}</p></div></div>) : <p className="text-xs text-sidebar-foreground/45">No activity yet.</p>}</div></div>}
  </div>;
}

function ProjectBoard({ data, cards, onStatus }: { data: DemoData; cards: DemoData["board"]; onStatus: (id: string, status: BoardStatus) => void }) {
  const [filter, setFilter] = useState("All statuses");
  const visibleCards = cards.filter((card) => filter === "All statuses" || card.status === filter);
  return <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-sidebar-foreground/45">{visibleCards.length} task cards · edits apply only to this session</p><label className="flex items-center gap-2 text-[10px] text-sidebar-foreground/50"><Filter size={13} /> Status<select aria-label="Filter board by status" data-testid="select-board-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-8 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2 text-[10px] text-sidebar-foreground outline-none"><option>All statuses</option>{boardStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div>
    <div className="grid gap-3 lg:grid-cols-4">{boardStatuses.map((status, index) => <section key={status} className="min-h-44 rounded-xl border border-sidebar-border/70 bg-[#141711] p-2.5">
      <div className="mb-2 flex items-center justify-between px-1 py-1"><h3 className="flex items-center gap-2 text-[10px] font-bold">{status}<span className="font-mono text-[9px] text-sidebar-foreground/35">{visibleCards.filter((card) => card.status === status).length}</span></h3><span className={`h-1.5 w-1.5 rounded-full ${["bg-sidebar-foreground/35", "bg-primary", "bg-amber-300", "bg-emerald-300"][index]}`} /></div>
      <div className="space-y-2">{visibleCards.filter((card) => card.status === status).map((card) => <article key={card.id} data-testid={`board-card-${card.id}`} className="rounded-lg border border-sidebar-border/70 bg-[#1b2019] p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><span className="rounded bg-sidebar-accent/80 px-1.5 py-1 font-mono text-[8px] uppercase tracking-wider text-sidebar-foreground/50">{card.trade}</span><MoreHorizontal size={14} className="text-sidebar-foreground/30" /></div><p className="mt-2.5 text-[11px] font-semibold leading-4">{card.title}</p><div className="mt-3 flex items-center justify-between"><span className="text-[9px] text-sidebar-foreground/40">{card.due} · {card.assignee.split(" ")[0]}</span><span className="grid h-6 w-6 place-items-center rounded-full border border-sidebar-border bg-sidebar-accent/50 text-[8px] font-bold text-sidebar-foreground/70">{card.assignee.split(" ").map((part) => part[0]).join("")}</span></div><label className="mt-3 block"><span className="sr-only">Change status for {card.title}</span><select aria-label={`Status for ${card.title}`} data-testid={`select-status-${card.id}`} value={card.status} onChange={(event) => onStatus(card.id, event.target.value as BoardStatus)} className="h-7 w-full rounded-md border border-sidebar-border/70 bg-[#151912] px-2 text-[9px] text-sidebar-foreground/65 outline-none focus:border-primary/50">{boardStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><p className="mt-2 truncate text-[8px] text-sidebar-foreground/30">{projectOf(data, card.projectId)?.name}</p></article>)}</div>
    </section>)}</div>
  </div>;
}

function ScheduleView({ data, mode, setMode, openProject }: { data: DemoData; mode: "Timeline" | "Calendar"; setMode: (mode: "Timeline" | "Calendar") => void; openProject: (id: string) => void }) {
  const [windowRange, setWindowRange] = useState("30 days");
  const milestones = data.projects.map((project, index) => [
    { id: `${project.id}-m1`, project, label: project.phase, date: ["Jun 20", "Jun 24", "Jun 21", "Jun 27"][index % 4], kind: "Phase" },
    { id: `${project.id}-m2`, project, label: "Next inspection / owner walk", date: ["Jun 27", "Jul 02", "Jun 25", "Jul 08"][index % 4], kind: "Milestone" },
  ]).flat();
  const rows = data.projects.map((project, index) => ({ project, left: [9, 25, 51, 66][index % 4], width: [43, 56, 37, 28][index % 4] }));
  const days = ["Jun 16", "Jun 18", "Jun 20", "Jun 23", "Jun 25", "Jun 27", "Jun 30", "Jul 02", "Jul 04", "Jul 08"];
  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div><p className="text-xs font-semibold">30-day lookahead</p><p className="mt-1 text-[10px] text-sidebar-foreground/40">Jun 16 — Jul 16, 2025 · Mountain region</p></div><Button testId="button-schedule-previous" onClick={() => setWindowRange("Previous 30 days")} title="Previous date range"><ChevronLeft size={14} /></Button><Button testId="button-schedule-next" onClick={() => setWindowRange("Next 30 days")} title="Next date range"><ChevronRight size={14} /></Button></div>
      <div className="flex flex-wrap items-center gap-2"><select aria-label="Schedule date range" data-testid="select-schedule-range" value={windowRange.includes("days") ? windowRange : "30 days"} onChange={(event) => setWindowRange(event.target.value)} className="h-9 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-[10px] text-sidebar-foreground outline-none"><option>30 days</option><option>60 days</option><option>90 days</option></select><div className="flex rounded-lg border border-sidebar-border p-1"><Button testId="button-schedule-timeline" className={`!h-7 !px-3 ${mode === "Timeline" ? "!bg-primary/15 !text-primary" : ""}`} onClick={() => setMode("Timeline")}><ActivityIcon size={13} /> Timeline</Button><Button testId="button-schedule-calendar" className={`!h-7 !px-3 ${mode === "Calendar" ? "!bg-primary/15 !text-primary" : ""}`} onClick={() => setMode("Calendar")}><CalendarDays size={13} /> Calendar</Button></div></div>
    </div>
    {mode === "Timeline" ? <div className="overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15]">
      <div className="grid grid-cols-[170px_1fr] border-b border-sidebar-border/70 sm:grid-cols-[220px_1fr]"><div className="p-3 font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/40">Project / phase</div><div className="grid grid-cols-5 border-l border-sidebar-border/60">{["Jun 16", "Jun 23", "Jun 30", "Jul 07", "Jul 14"].map((date) => <div key={date} className="border-r border-sidebar-border/50 px-2 py-3 font-mono text-[9px] text-sidebar-foreground/40">{date}</div>)}</div></div>
      <div className="divide-y divide-sidebar-border/50">{rows.map(({ project, left, width }) => <div key={project.id} className="grid min-h-[86px] grid-cols-[170px_1fr] sm:grid-cols-[220px_1fr]"><button type="button" data-testid={`schedule-project-${project.id}`} onClick={() => openProject(project.id)} className="min-w-0 p-3 text-left hover:bg-sidebar-accent/30"><p className="truncate text-[10px] font-semibold">{project.name}</p><p className="mt-1 truncate text-[9px] text-sidebar-foreground/40">{project.phase}</p></button><div className="relative border-l border-sidebar-border/60 bg-[linear-gradient(90deg,transparent_calc(20%-1px),hsl(var(--sidebar-border)/.48)_20%,transparent_calc(20%+1px),transparent_calc(40%-1px),hsl(var(--sidebar-border)/.48)_40%,transparent_calc(40%+1px),transparent_calc(60%-1px),hsl(var(--sidebar-border)/.48)_60%,transparent_calc(60%+1px),transparent_calc(80%-1px),hsl(var(--sidebar-border)/.48)_80%,transparent_calc(80%+1px))]"><div className="absolute top-5 h-7 rounded-md border border-primary/25 bg-primary/15 px-2 py-1.5 text-[9px] font-semibold text-primary" style={{ left: `${left}%`, width: `${width}%` }}><span className="block truncate">{project.phase}</span></div><div className="absolute bottom-3 flex items-center gap-1.5" style={{ left: `${Math.min(left + width, 86)}%` }}><span className="h-2 w-2 rotate-45 border border-cyan-200 bg-cyan-200/30" /><span className="whitespace-nowrap text-[8px] text-sidebar-foreground/45">Owner walk</span></div></div></div>)}</div>
      <div className="flex items-center gap-5 border-t border-sidebar-border/60 px-4 py-3 font-mono text-[8px] uppercase tracking-widest text-sidebar-foreground/40"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-primary/60" />Active phase</span><span className="flex items-center gap-2"><span className="h-2 w-2 rotate-45 border border-cyan-200" />Milestone</span><span className="ml-auto">Range: {windowRange}</span></div>
    </div> : <div className="grid gap-5 xl:grid-cols-[1fr_330px]"><section className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-bold">June 2025</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Coordination calendar · sample dates</p></div><div className="flex gap-1"><Button testId="button-calendar-prev" title="Previous month" onClick={() => setWindowRange("Previous month")}><ChevronLeft size={13} /></Button><Button testId="button-calendar-next" title="Next month" onClick={() => setWindowRange("Next month")}><ChevronRight size={13} /></Button></div></div><div className="grid grid-cols-7 border-l border-t border-sidebar-border/60">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="border-b border-r border-sidebar-border/60 py-2 text-center font-mono text-[8px] uppercase tracking-wider text-sidebar-foreground/40">{day}</div>)}{Array.from({ length: 35 }, (_, index) => { const day = index - 5; const valid = day > 0 && day <= 30; const dayMilestones = milestones.filter((item, i) => [17, 18, 20, 21, 24, 25, 27, 30, 2, 8][i] === (day > 30 ? day - 30 : day)); return <div key={index} className={`min-h-[70px] border-b border-r border-sidebar-border/50 p-1.5 ${day === 17 ? "bg-primary/[.055]" : ""}`}><span className={`font-mono text-[9px] ${valid ? day === 17 ? "text-primary" : "text-sidebar-foreground/55" : "text-sidebar-foreground/20"}`}>{valid ? day : day <= 0 ? 26 + day : day - 30}</span>{dayMilestones.slice(0, 2).map((item) => <button key={item.id} type="button" data-testid={`calendar-event-${item.id}`} onClick={() => openProject(item.project.id)} className="mt-1 block w-full truncate rounded bg-primary/15 px-1 py-1 text-left text-[7px] text-primary hover:bg-primary/25">{item.project.name}</button>)}</div>; })}</div></section><aside className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4"><p className="font-mono text-[9px] uppercase tracking-widest text-primary">Upcoming / next 14 days</p><div className="mt-4 space-y-2">{milestones.slice(0, 6).map((item) => <button type="button" key={item.id} data-testid={`calendar-upcoming-${item.id}`} onClick={() => openProject(item.project.id)} className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border/60 p-2.5 text-left hover:bg-sidebar-accent/35"><div className="min-w-9 rounded bg-primary/10 px-1.5 py-2 text-center font-mono text-[8px] text-primary">{item.date}</div><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{item.label}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">{item.project.name}</p></div></button>)}</div></aside></div>}
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/15 p-3 text-[10px] leading-4 text-sidebar-foreground/40"><Clock3 size={13} className="mt-0.5 shrink-0 text-primary/70" />Schedule dates and visual modes are representative sample data. Date-range controls change the local preview label only.</div>
  </div>;
}

function TradesView({ data, filter, setFilter }: { data: DemoData; filter: string; setFilter: (filter: string) => void }) {
  const trades = ["All trades", ...Array.from(new Set(data.vendors.map((vendor) => vendor.trade)))];
  const [search, setSearch] = useState("");
  const vendors = data.vendors.filter((vendor) => (filter === "All trades" || vendor.trade === filter) && `${vendor.name} ${vendor.contact} ${vendor.trade}`.toLowerCase().includes(search.toLowerCase()));
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  return <div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Qualified partners" value={String(data.vendors.length).padStart(2, "0")} delta="across active trades" icon={HardHat} /><Metric label="Preferred vendors" value={String(data.vendors.filter((vendor) => vendor.status === "Preferred").length).padStart(2, "0")} delta="repeat partners" icon={ShieldCheck} tone="cyan" /><Metric label="Active commitments" value={String(data.vendors.reduce((sum, vendor) => sum + vendor.activeJobs, 0)).padStart(2, "0")} delta="current job assignments" icon={BriefcaseBusiness} /></div>
    <div className="mb-4 flex flex-wrap items-center gap-2"><div className="relative min-w-[190px] flex-1"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/35" /><input aria-label="Search vendors" data-testid="input-vendor-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, contact, trade…" className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 pl-9 pr-3 text-xs outline-none focus:border-primary/45" /></div><label className="flex items-center gap-2 text-[10px] text-sidebar-foreground/50"><SlidersHorizontal size={13} /><select aria-label="Filter vendors by trade" data-testid="select-vendor-trade" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-xs text-sidebar-foreground outline-none">{trades.map((trade) => <option key={trade}>{trade}</option>)}</select></label><span data-testid="text-vendor-count" className="font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/35">{vendors.length} vendors</span></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{vendors.map((vendor, index) => <article key={vendor.id} data-testid={`vendor-card-${vendor.id}`} className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4 transition hover:border-primary/35"><div className="flex items-start justify-between"><div className={`grid h-10 w-10 place-items-center rounded-xl border ${index % 2 ? "border-cyan-200/15 bg-cyan-200/[.07] text-cyan-100" : "border-primary/20 bg-primary/10 text-primary"}`}><HardHat size={17} /></div><StatusPill>{vendor.status}</StatusPill></div><div className="mt-3 flex items-center justify-between gap-2"><h3 className="truncate text-sm font-bold">{vendor.name}</h3><span className="font-mono text-[10px] text-amber-200">{vendor.rating} / 5</span></div><p className="mt-1 text-[10px] text-sidebar-foreground/45">{vendor.trade}</p><div className="mt-4 space-y-2 border-t border-sidebar-border/60 pt-3 text-[10px]"><div className="flex justify-between"><span className="text-sidebar-foreground/40">Primary contact</span><span>{vendor.contact}</span></div><div className="flex justify-between gap-2"><span className="text-sidebar-foreground/40">Email</span><span className="truncate text-sidebar-foreground/65">{vendor.email}</span></div><div className="flex justify-between"><span className="text-sidebar-foreground/40">Active jobs</span><span className="font-mono">{vendor.activeJobs}</span></div></div><button type="button" data-testid={`button-vendor-details-${vendor.id}`} onClick={() => setSelectedVendor(selectedVendor === vendor.id ? null : vendor.id)} className="mt-3 w-full rounded-lg border border-sidebar-border/60 py-2 text-[10px] font-semibold text-sidebar-foreground/65 hover:border-primary/30 hover:text-primary">{selectedVendor === vendor.id ? "Hide sample details" : "View vendor details"} <ChevronDown size={12} className="ml-1 inline" /></button>{selectedVendor === vendor.id && <div className="mt-3 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/20 p-3 text-[10px] text-sidebar-foreground/60"><p>{vendor.phone}</p><p className="mt-1">{data.quotes.filter((quote) => quote.vendorId === vendor.id).length} sample quote(s) · {data.invoices.filter((invoice) => invoice.vendorId === vendor.id).length} invoice(s)</p></div>}</article>)}</div>
  </div>;
}

function QuotesView({ data, filter, setFilter, editing, setEditing, draft, setDraft, onChange, flash, onEdit }: {
  data: DemoData; filter: string; setFilter: (filter: string) => void; editing: string | null; setEditing: (id: string | null) => void;
  draft: string; setDraft: (value: string) => void; onChange: (id: string, status: "Approved" | "Declined") => void; flash: (title: string, detail?: string) => void; onEdit: (id: string, amount: number) => void;
}) {
  const filtered = data.quotes.filter((quote) => filter === "All quotes" || quote.status === filter);
  const saveEdit = (id: string) => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) { flash("Enter a valid quote amount", "The amount must be greater than zero."); return; }
    onEdit(id, value);
    flash("Quote amount updated", "Demo only · this estimate changed in the current session.");
    setEditing(null);
  };
  return <div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Quotes under review" value={String(data.quotes.filter((quote) => quote.status === "Review").length).padStart(2, "0")} delta="awaiting a decision" icon={FileText} /><Metric label="Total under review" value={compactMoney(data.quotes.filter((quote) => quote.status === "Review").reduce((sum, quote) => sum + quote.amount, 0))} delta="current submitted value" icon={CircleDollarSign} /><Metric label="Approved this cycle" value={String(data.quotes.filter((quote) => quote.status === "Approved").length).padStart(2, "0")} delta="sample procurement" icon={CheckCheck} tone="cyan" /></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-sidebar-foreground/45">Bid packages linked to active work</p><label className="text-[10px] text-sidebar-foreground/45">Filter <select aria-label="Filter vendor quotes" data-testid="select-quote-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="ml-2 h-8 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2 text-[10px] text-sidebar-foreground outline-none">{["All quotes", "Review", "Approved", "Declined"].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="space-y-3">{filtered.length ? filtered.map((quote) => { const vendor = vendorOf(data, quote.vendorId); const project = projectOf(data, quote.projectId); return <article key={quote.id} data-testid={`quote-card-${quote.id}`} className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-[230px] flex-1 items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><FileText size={17} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{quote.title}</h3><StatusPill>{quote.status}</StatusPill></div><p className="mt-1.5 text-[10px] text-sidebar-foreground/50">{vendor?.name} <span className="px-1 text-sidebar-foreground/25">·</span>{project?.name}</p><p className="mt-1 text-[9px] text-sidebar-foreground/35">Submitted {quote.submitted} · expires {quote.expires}</p></div></div><div className="text-right"><p className="font-mono text-xl">{money(quote.amount)}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">Submitted total</p></div></div>
      <div className="mt-4 grid gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/15 p-3 sm:grid-cols-2">{quote.lines.map((line) => <div key={line.label} className="flex justify-between gap-3 text-[10px]"><span className="text-sidebar-foreground/55">{line.label}</span><span className="font-mono">{money(line.amount)}</span></div>)}</div>
      {editing === quote.id ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/[.045] p-3"><label htmlFor={`quote-amount-${quote.id}`} className="text-[10px] text-sidebar-foreground/55">Revised amount</label><input id={`quote-amount-${quote.id}`} data-testid={`input-quote-amount-${quote.id}`} type="number" min="1" step="100" value={draft} onChange={(event) => setDraft(event.target.value)} className="h-8 w-36 rounded-md border border-sidebar-border bg-[#11140f] px-2 font-mono text-xs outline-none focus:border-primary/50" /><Button testId={`button-save-quote-edit-${quote.id}`} variant="gold" className="!h-8" onClick={() => saveEdit(quote.id)}><Check size={12} /> Stage edit</Button><Button testId={`button-cancel-quote-edit-${quote.id}`} className="!h-8" onClick={() => setEditing(null)}>Cancel</Button></div>
        : <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-[9px] text-sidebar-foreground/40">Compare against scope and allowances</span><Button testId={`button-edit-quote-${quote.id}`} className="!h-8" onClick={() => { setEditing(quote.id); setDraft(String(quote.amount)); }}>Edit estimate</Button></div>{quote.status === "Review" && <div className="flex gap-2"><Button testId={`button-decline-quote-${quote.id}`} variant="danger" className="!h-8" onClick={() => onChange(quote.id, "Declined")}>Decline</Button><Button testId={`button-approve-quote-${quote.id}`} variant="gold" className="!h-8" onClick={() => onChange(quote.id, "Approved")}><Check size={12} /> Approve</Button></div>}</div>}
    </article>; }) : <EmptyState title="No quotes in this view" detail="Switch the status filter to see the rest of the sample bids." />}</div>
    <p className="mt-4 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/10 p-3 text-[10px] text-sidebar-foreground/40">All quote approvals and edits are local demonstrations. No purchase order or vendor notification is created.</p>
  </div>;
}

function FinancialsView({ data, selectedInvoice, setSelectedInvoice, changeInvoice, openProject }: {
  data: DemoData; selectedInvoice: string | null; setSelectedInvoice: (id: string | null) => void;
  changeInvoice: (id: string, status: "Approved" | "Paid" | "Declined") => void; openProject: (id: string) => void;
}) {
  const [filter, setFilter] = useState("All invoices");
  const filtered = data.invoices.filter((invoice) => filter === "All invoices" || invoice.status === filter);
  const outstanding = data.invoices.filter((invoice) => invoice.status === "Pending approval").reduce((sum, invoice) => sum + invoice.amount, 0);
  return <div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Pending approval" value={compactMoney(outstanding)} delta={`${data.invoices.filter((invoice) => invoice.status === "Pending approval").length} invoices`} icon={FileCheck2} /><Metric label="Approved this month" value={compactMoney(data.invoices.filter((invoice) => invoice.status === "Approved").reduce((sum, invoice) => sum + invoice.amount, 0))} delta="awaiting payment" icon={CheckCheck} tone="cyan" /><Metric label="Paid this month" value={compactMoney(data.invoices.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoice.amount, 0))} delta="sample transactions" icon={Wallet} /><Metric label="Portfolio budget" value={compactMoney(data.projects.reduce((sum, project) => sum + project.budget, 0))} delta="four active projects" icon={CircleDollarSign} /></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xs font-bold">Invoices & approvals</h2><p className="mt-1 text-[10px] text-sidebar-foreground/40">Review sample payables linked to active projects</p></div><select aria-label="Filter invoices by status" data-testid="select-invoice-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-xs text-sidebar-foreground outline-none">{["All invoices", "Pending approval", "Approved", "Paid"].map((value) => <option key={value}>{value}</option>)}</select></div>
    <div className="overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15]"><div className="hidden grid-cols-[1.15fr_1fr_1fr_120px_125px] gap-3 border-b border-sidebar-border/70 bg-sidebar-accent/20 px-4 py-3 font-mono text-[8px] uppercase tracking-widest text-sidebar-foreground/40 md:grid"><span>Invoice / vendor</span><span>Project</span><span>Description</span><span>Amount</span><span>Status</span></div>
      {filtered.map((invoice) => <div key={invoice.id} data-testid={`invoice-row-${invoice.id}`} className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-sidebar-border/50 p-4 last:border-0 md:grid-cols-[1.15fr_1fr_1fr_120px_125px] md:items-center md:gap-3 md:py-3"><div><p className="text-xs font-semibold">{invoice.number}</p><p className="mt-1 text-[9px] text-sidebar-foreground/45">{vendorOf(data, invoice.vendorId)?.name}</p></div><button type="button" data-testid={`button-invoice-project-${invoice.id}`} onClick={() => openProject(invoice.projectId)} className="text-left text-[10px] text-primary hover:underline">{projectOf(data, invoice.projectId)?.name}</button><div className="col-span-2 md:col-span-1"><p className="text-[10px] text-sidebar-foreground/60">{invoice.description}</p><p className="mt-1 text-[9px] text-sidebar-foreground/35">{invoice.date} · Due {invoice.due}</p></div><div className="flex items-center justify-between md:block"><span className="text-[9px] text-sidebar-foreground/40 md:hidden">Amount</span><span className="font-mono text-xs">{money(invoice.amount)}</span></div><div className="flex items-center justify-between gap-2"><StatusPill>{invoice.status}</StatusPill>{invoice.status === "Pending approval" ? <Button testId={`button-review-invoice-${invoice.id}`} className="!h-7 !px-2" onClick={() => setSelectedInvoice(invoice.id)}>Review</Button> : invoice.status === "Approved" ? <Button testId={`button-mark-paid-${invoice.id}`} className="!h-7 !px-2" onClick={() => changeInvoice(invoice.id, "Paid")}>Mark paid</Button> : null}</div></div>)}
    </div>
    <section className="mt-5 rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-bold">Project cost snapshot</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Spend compared with authorized budget</p></div><span className="font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/35">Sample ledger</span></div><div className="mt-4 space-y-3">{data.projects.map((project) => <button type="button" key={project.id} data-testid={`financial-project-${project.id}`} onClick={() => openProject(project.id)} className="grid w-full grid-cols-[minmax(90px,1fr)_2fr_72px] items-center gap-3 text-left"><span className="truncate text-[10px] font-medium">{project.name}</span><span><Progress value={Math.round(project.spent / project.budget * 100)} /></span><span className="text-right font-mono text-[9px] text-sidebar-foreground/55">{compactMoney(project.spent)}</span></button>)}</div></section>
  </div>;
}

function CommunicationsView({ data, persona, channel, setChannel, draft, setDraft, send, flash, openProject }: {
  data: DemoData; persona: string; channel: string; setChannel: (value: string) => void; draft: string; setDraft: (value: string) => void; send: () => void; flash: (title: string, detail?: string) => void; openProject: (id: string) => void;
}) {
  const channels = Array.from(new Set(data.messages.map((message) => message.channel)));
  const messages = data.messages.filter((message) => message.channel === channel);
  const projectId = channel.split(" · ")[0].toLowerCase().replaceAll(" ", "");
  const channelProject = data.projects.find((project) => project.name.toLowerCase().replaceAll(/[^a-z0-9]/g, "").startsWith(projectId.split("&")[0]));
  return <div className="grid min-h-[600px] overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15] lg:grid-cols-[250px_1fr]">
    <aside className="border-b border-sidebar-border/70 bg-[#141711] p-3 lg:border-b-0 lg:border-r"><div className="flex items-center justify-between px-2 py-2"><div><p className="font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/40">Channels</p><p className="mt-1 text-[10px] text-sidebar-foreground/35">Sample project rooms</p></div><button type="button" aria-label="Simulate new channel" data-testid="button-new-channel" onClick={() => flash("Channel creation simulated", "New project channels are not created in this sandbox.")} className="rounded-md p-1.5 text-sidebar-foreground/45 hover:bg-sidebar-accent"><Plus size={14} /></button></div>
      <div className="mt-2 space-y-1">{channels.map((item, index) => <button type="button" key={item} data-testid={`button-channel-${index}`} aria-pressed={channel === item} onClick={() => setChannel(item)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left ${channel === item ? "bg-primary/10 text-primary" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50"}`}><span className="grid h-7 w-7 place-items-center rounded-md border border-sidebar-border/70 bg-sidebar-accent/35"><MessageSquare size={13} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold">{item.split(" · ")[0]}</span><span className="mt-0.5 block truncate text-[9px] opacity-60">{item.split(" · ")[1]}</span></span><span className="h-1.5 w-1.5 rounded-full bg-primary/70" /></button>)}</div>
      <div className="mt-5 border-t border-sidebar-border/60 pt-4"><p className="px-2 font-mono text-[8px] uppercase tracking-widest text-sidebar-foreground/35">Sandbox notice</p><p className="px-2 pt-2 text-[9px] leading-4 text-sidebar-foreground/40">Messages you send are added to this session only. Nothing is delivered to project teams.</p></div>
    </aside>
    <div className="flex min-h-[580px] min-w-0 flex-col">
      <div className="flex items-center justify-between border-b border-sidebar-border/65 px-4 py-3.5"><div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><MessageSquare size={15} /></div><div><p className="text-xs font-bold">{channel}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">{channelProject?.name || "Project coordination"} · {messages.length} messages</p></div></div><Button testId="button-channel-details" onClick={() => channelProject ? openProject(channelProject.id) : flash("Channel details", "Sample channel metadata only.")}><MoreHorizontal size={16} /></Button></div>
      <div aria-label="Conversation messages" data-testid="message-thread" className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">{[...messages].reverse().map((message) => <div key={message.id} data-testid={`message-${message.id}`} className={`flex items-start gap-3 ${message.author === persona ? "flex-row-reverse" : ""}`}><div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${message.author === persona ? "border-primary/30 bg-primary/10 text-primary" : "border-sidebar-border bg-sidebar-accent text-sidebar-foreground/65"}`}>{message.author.split(" ").map((part) => part[0]).join("")}</div><div className={`max-w-[82%] ${message.author === persona ? "text-right" : ""}`}><div className={`mb-1.5 flex items-center gap-2 text-[9px] text-sidebar-foreground/40 ${message.author === persona ? "justify-end" : ""}`}><span className="font-semibold text-sidebar-foreground/65">{message.author}</span><span>{message.time}</span></div><div className={`rounded-xl px-3.5 py-2.5 text-left text-[11px] leading-5 ${message.author === persona ? "rounded-tr-sm border border-primary/20 bg-primary/[.09]" : "rounded-tl-sm border border-sidebar-border/70 bg-sidebar-accent/35"}`}>{message.body}</div></div></div>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); send(); }} className="border-t border-sidebar-border/65 p-3 sm:p-4"><label htmlFor="message-draft" className="sr-only">Write a sample message</label><div className="flex items-end gap-2 rounded-xl border border-sidebar-border bg-[#131610] p-2 focus-within:border-primary/45"><textarea id="message-draft" data-testid="input-message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={`Message ${channel.split(" · ")[0]}…`} rows={2} className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-sidebar-foreground/30" /><button type="submit" data-testid="button-send-message" disabled={!draft.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Add simulated message"><Send size={15} /></button></div><p className="mt-2 px-1 text-[9px] text-sidebar-foreground/35">Enter to send · Shift + Enter for a new line · local demo only</p></form>
    </div>
  </div>;
}

function UsersView({ data, persona, onPersona, flash }: { data: DemoData; persona: string; onPersona: (persona: Persona) => void; flash: (title: string, detail?: string) => void }) {
  const [roleFilter, setRoleFilter] = useState("All access");
  const [visibility, setVisibility] = useState(true);
  const roles = ["All access", ...Array.from(new Set(data.team.map((member) => member.access)))];
  const members = data.team.filter((member) => roleFilter === "All access" || member.access === roleFilter);
  return <div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Sample users" value={String(data.team.length).padStart(2, "0")} delta="project roster" icon={Users} /><Metric label="Access roles" value={String(new Set(data.team.map((member) => member.access)).size).padStart(2, "0")} delta="illustrative permissions" icon={ShieldCheck} tone="cyan" /><Metric label="Client viewers" value={String(data.team.filter((member) => member.access === "Client").length).padStart(2, "0")} delta="restricted sample access" icon={BriefcaseBusiness} /></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xs font-bold">Workspace roster</h2><p className="mt-1 text-[10px] text-sidebar-foreground/40">Switching persona demonstrates role-based visibility.</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Filter team by access role" data-testid="select-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-9 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-xs text-sidebar-foreground outline-none">{roles.map((role) => <option key={role}>{role}</option>)}</select><Button testId="button-invite-demo-user" variant="outline" onClick={() => flash("Invitation simulated", "No invite was sent and no user was added.")}><Plus size={14} /> Invite user</Button></div></div>
    <div className="overflow-hidden rounded-xl border border-sidebar-border/80 bg-[#171b15]"><div className="hidden grid-cols-[1.4fr_1fr_1.1fr_1fr_120px] gap-3 border-b border-sidebar-border/70 bg-sidebar-accent/20 px-4 py-3 font-mono text-[8px] uppercase tracking-widest text-sidebar-foreground/40 md:grid"><span>Team member</span><span>Role</span><span>Email</span><span>Project scope</span><span>Access</span></div>{members.map((member) => <div key={member.id} data-testid={`user-row-${member.id}`} className={`grid grid-cols-2 gap-3 border-b border-sidebar-border/50 p-4 last:border-0 md:grid-cols-[1.4fr_1fr_1.1fr_1fr_120px] md:items-center md:gap-3 md:py-3 ${member.name === persona ? "bg-primary/[.035]" : ""}`}><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-full border border-primary/20 bg-primary/10 text-[9px] font-bold text-primary">{member.initials}</div><div><p className="text-[11px] font-semibold">{member.name}{member.name === persona && <span className="ml-2 font-mono text-[8px] uppercase text-primary">Active</span>}</p><p className="mt-1 text-[9px] text-sidebar-foreground/40">{member.role}</p></div></div><span className="text-[10px] text-sidebar-foreground/55">{member.role}</span><span data-testid={`text-user-email-${member.id}`} className="truncate text-[10px] text-sidebar-foreground/50">{member.email}</span><span className="text-[10px] text-sidebar-foreground/50">{member.projectIds.map((id) => projectOf(data, id)?.name.split(" ")[0]).join(", ")}</span><StatusPill>{member.access}</StatusPill></div>)}</div>
    <section className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold">Role visibility preview</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">The navigation changes with the selected sample persona.</p></div><span className="rounded-md border border-cyan-200/20 bg-cyan-200/[.06] px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-cyan-100">Preview</span></div><div className="mt-4 flex flex-wrap gap-2">{[["Morgan Reyes", "Admin"], ["Avery Chen", "Project lead"], ["Jordan Blake", "Field"], ["Elena Park", "Client"], ["Riley Foster", "Finance"]].map(([name, role]) => <button type="button" key={name} data-testid={`button-preview-role-${role.toLowerCase().replaceAll(" ", "-")}`} aria-pressed={persona === name} onClick={() => onPersona(name as Persona)} className={`rounded-lg border px-3 py-2 text-left transition ${persona === name ? "border-primary/40 bg-primary/10 text-primary" : "border-sidebar-border bg-sidebar-accent/20 text-sidebar-foreground/60 hover:border-sidebar-border/90"}`}><span className="block text-[10px] font-semibold">{name}</span><span className="mt-1 block text-[8px] opacity-55">{role}</span></button>)}</div></div>
      <div className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-4"><h3 className="text-xs font-bold">Client visibility</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">A sample view of external access boundaries.</p><button type="button" data-testid="toggle-client-visibility" aria-pressed={visibility} onClick={() => setVisibility((value) => !value)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-sidebar-border/60 bg-sidebar-accent/15 p-3 text-left"><span><span className="block text-[10px] font-semibold">Client updates enabled</span><span className="mt-1 block text-[9px] text-sidebar-foreground/40">Selected client sample sees published project records.</span></span><span className={`relative h-5 w-9 rounded-full transition ${visibility ? "bg-primary" : "bg-sidebar-accent"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${visibility ? "left-[18px]" : "left-0.5"}`} /></span></button></div>
    </section><p className="mt-4 text-[9px] text-sidebar-foreground/35">Invitations and permission changes are not transmitted. Persona changes only affect this demo interface.</p>
  </div>;
}

function ProfileView({ persona, prefs, setPrefs, onReset, flash }: {
  persona: string; prefs: { weekly: boolean; mentions: boolean; digest: boolean }; setPrefs: (prefs: { weekly: boolean; mentions: boolean; digest: boolean }) => void; onReset: () => void; flash: (title: string) => void;
}) {
  const member = initialProfile(persona);
  const toggle = (key: keyof typeof prefs) => setPrefs({ ...prefs, [key]: !prefs[key] });
  return <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
    <div className="space-y-5"><section className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-5 sm:p-6"><div className="flex flex-wrap items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-lg font-bold text-primary">{member.initials}</div><div className="min-w-0 flex-1"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-primary">Sample account</p><h2 data-testid="profile-persona-name" className="mt-1 text-xl font-bold">{persona}</h2><p className="mt-1 text-xs text-sidebar-foreground/45">{member.role} · {member.email}</p></div><StatusPill>{member.access}</StatusPill></div><div className="mt-6 grid gap-3 border-t border-sidebar-border/60 pt-5 sm:grid-cols-2"><ProfileField label="Workspace" value="Luminova Fieldworks" /><ProfileField label="Region" value="Mountain · United States" /><ProfileField label="Time zone" value="Mountain Time (UTC−06:00)" /><ProfileField label="Default project" value="Riverstone House" /></div></section>
      <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-5"><div className="flex items-start justify-between"><div><h3 className="text-xs font-bold">Notification preferences</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Adjust this local sample profile.</p></div><Bell size={16} className="text-primary/75" /></div><div className="mt-3 divide-y divide-sidebar-border/50">{([["weekly", "Weekly project digest", "Monday morning portfolio summary"], ["mentions", "Direct mentions", "When your name is called in a project channel"], ["digest", "Daily field log", "A compact recap of new site records"]] as const).map(([key, label, description]) => <PreferenceRow key={key} testId={`toggle-pref-${key}`} label={label} description={description} value={prefs[key]} onToggle={() => toggle(key)} />)}</div></section>
      <section className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-5"><div className="flex items-start justify-between"><div><h3 className="text-xs font-bold">Workspace defaults</h3><p className="mt-1 text-[10px] text-sidebar-foreground/40">Preferences are temporary for this session.</p></div><SlidersHorizontal size={16} className="text-sidebar-foreground/45" /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] text-sidebar-foreground/55">Start page<select aria-label="Choose demo start page preference" data-testid="select-start-page" onChange={() => flash("Start page preference updated")} defaultValue="Command center" className="mt-2 h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/35 px-3 text-xs text-sidebar-foreground outline-none"><option>Command center</option><option>All projects</option><option>Schedule</option><option>Communications</option></select></label><label className="text-[10px] text-sidebar-foreground/55">Date format<select aria-label="Choose date format" data-testid="select-date-format" onChange={() => flash("Date format preference updated")} defaultValue="MMM d, yyyy" className="mt-2 h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/35 px-3 text-xs text-sidebar-foreground outline-none"><option>MMM d, yyyy</option><option>MM/dd/yyyy</option><option>dd/MM/yyyy</option></select></label></div><div className="mt-4 flex justify-end"><Button testId="button-save-profile" variant="gold" onClick={() => flash("Profile preferences staged")}><Check size={13} /> Save preferences</Button></div></section></div>
    <aside className="space-y-4"><section className="rounded-xl border border-primary/20 bg-primary/[.045] p-5"><div className="flex items-center gap-2 text-primary"><Sparkles size={16} /><span className="font-mono text-[9px] uppercase tracking-[.18em]">Demo session</span></div><h3 className="mt-3 text-sm font-bold">A safe place to explore</h3><p className="mt-2 text-[11px] leading-5 text-sidebar-foreground/55">This workspace runs entirely in memory. No account changes, messages, approvals, files, or records are sent to a service. Reload returns everything to the starting scenario.</p><div className="mt-4 space-y-2 border-t border-primary/15 pt-4 text-[10px] text-sidebar-foreground/55"><p className="flex items-center gap-2"><Check size={12} className="text-emerald-300" /> Sample data only</p><p className="flex items-center gap-2"><Check size={12} className="text-emerald-300" /> Backend operations simulated</p><p className="flex items-center gap-2"><Check size={12} className="text-emerald-300" /> Reset available at any time</p></div></section><section className="rounded-xl border border-sidebar-border/80 bg-[#171b15] p-5"><div className="grid h-9 w-9 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground/65"><RotateCcw size={15} /></div><h3 className="mt-3 text-xs font-bold">Restore sample scenario</h3><p className="mt-1 text-[10px] leading-4 text-sidebar-foreground/45">Clear local changes and return to the original sample portfolio.</p><Button testId="button-profile-reset-demo" variant="outline" className="mt-4 w-full" onClick={onReset}>Reset demo workspace</Button></section><p className="px-1 font-mono text-[8px] uppercase leading-4 tracking-widest text-sidebar-foreground/30">Luminova construction operations · public demo</p></aside>
  </div>;
}

function initialProfile(name: string) {
  const member = cloneDemoData().team.find((item) => item.name === name);
  return member || { initials: "MR", role: "Project Manager", email: "morgan@luminova.build", access: "Admin" };
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-sidebar-border/60 bg-sidebar-accent/15 px-3 py-2.5"><p className="font-mono text-[8px] uppercase tracking-widest text-sidebar-foreground/35">{label}</p><p className="mt-1.5 text-[10px] font-medium">{value}</p></div>;
}

function PreferenceRow({ label, description, value, onToggle, testId }: { label: string; description: string; value: boolean; onToggle: () => void; testId: string }) {
  return <button type="button" data-testid={testId} aria-pressed={value} onClick={onToggle} className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-sidebar-accent/10"><span><span className="block text-[11px] font-semibold">{label}</span><span className="mt-1 block text-[9px] text-sidebar-foreground/40">{description}</span></span><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-primary" : "bg-sidebar-accent"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${value ? "left-[18px]" : "left-0.5"}`} /></span></button>;
}
