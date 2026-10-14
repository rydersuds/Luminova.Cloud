import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HardHat,
  MapPin,
  MessageSquare,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  getGetBoardScheduleQueryKey,
  getGetCurrentWorkspaceUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetFinancialSummaryQueryKey,
  getGetProjectsQueryKey,
  getGetPurchaseApprovalsQueryKey,
  useGetBoardSchedule,
  useGetCurrentWorkspaceUser,
  useGetDashboardSummary,
  useGetFinancialSummary,
  useGetProjects,
  useGetPurchaseApprovals,
} from "@workspace/api-client-react";
import { Link } from "wouter";

const money = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value)
    : "—";

const shortDate = (value?: string | null) => {
  if (!value) return "Date not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
};

const dayDistance = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
};

const moneyRemaining = (budgeted: number, invoiced: number) => budgeted - invoiced;

function LoadError({ label, retry, busy }: { label: string; retry: () => void; busy: boolean }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-4" data-testid={`error-${label}`}>
      <p className="text-sm text-rose-100">{label} couldn’t be loaded.</p>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        data-testid={`button-retry-${label}`}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

function SectionHeading({ index, title, detail }: { index: string; title: string; detail?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="font-mono text-[10px] tracking-[0.16em] text-[#c6a15b]">{index}</span>
        <h2 className="truncate text-base font-bold tracking-[-0.02em] text-[#f4f0e7]">{title}</h2>
      </div>
      {detail && <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">{detail}</span>}
    </div>
  );
}

export default function MobileOverviewPage() {
  const user = useGetCurrentWorkspaceUser({
    query: { queryKey: getGetCurrentWorkspaceUserQueryKey(), retry: false },
  });
  const summaryQuery = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), retry: false, refetchInterval: 60_000 },
  });
  const projectsQuery = useGetProjects(
    {},
    { query: { queryKey: getGetProjectsQueryKey({}), retry: false, refetchInterval: 60_000 } },
  );
  const role = user.data?.role;
  const canSeeSchedule = role !== "Client" && !!role;
  const canSeeApprovals = role === "Admin" || role === "Project Manager";
  const hasEnabledBudgets = (summaryQuery.data?.budgetEnabledProjects ?? 0) > 0;
  const financialSummaryQuery = useGetFinancialSummary({
    query: {
      queryKey: getGetFinancialSummaryQueryKey(),
      enabled: canSeeApprovals && hasEnabledBudgets,
      retry: false,
    },
  });
  const scheduleQuery = useGetBoardSchedule({
    query: {
      queryKey: getGetBoardScheduleQueryKey(),
      enabled: canSeeSchedule,
      retry: false,
      refetchInterval: 60_000,
    },
  });
  const approvalsQuery = useGetPurchaseApprovals({
    query: {
      queryKey: getGetPurchaseApprovalsQueryKey(),
      enabled: canSeeApprovals,
      retry: false,
      refetchInterval: 60_000,
    },
  });

  const projectRows = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];
  const scheduleRows = Array.isArray(scheduleQuery.data) ? scheduleQuery.data : [];
  const approvalRows = Array.isArray(approvalsQuery.data) ? approvalsQuery.data : [];
  const invalidProjectsPayload = projectsQuery.data !== undefined && (
    !Array.isArray(projectsQuery.data)
    || !projectRows.every((project) => project && typeof project === "object" && typeof project.id === "string" && typeof project.name === "string")
  );
  const invalidSchedulePayload = scheduleQuery.data !== undefined && (
    !Array.isArray(scheduleQuery.data)
    || !scheduleRows.every((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && typeof item.projectId === "string")
  );
  const invalidApprovalsPayload = approvalsQuery.data !== undefined && (
    !Array.isArray(approvalsQuery.data)
    || !approvalRows.every((approval) => approval && typeof approval === "object" && typeof approval.id === "string" && typeof approval.status === "string")
  );
  const projects = invalidProjectsPayload ? [] : projectRows;
  const schedule = invalidSchedulePayload ? [] : scheduleRows;
  const approvals = invalidApprovalsPayload ? [] : approvalRows;
  const summary = summaryQuery.data;
  const invalidSummaryPayload = summary !== undefined && (
    !summary
    || typeof summary.activeProjects !== "number"
    || typeof summary.awaitingApproval !== "number"
    || (summary.unreadMessages !== null && typeof summary.unreadMessages !== "number")
    || typeof summary.new360Photos !== "number"
    || typeof summary.budgetEnabledProjects !== "number"
    || typeof summary.budgeted !== "number"
    || typeof summary.invoiced !== "number"
    || !Array.isArray(summary.recentActivity)
    || !summary.recentActivity.every((entry) => entry && typeof entry.id === "string" && typeof entry.title === "string")
  );
  const activity = Array.isArray(summaryQuery.data?.recentActivity) ? summaryQuery.data.recentActivity : [];
  const today = new Date();
  const greetingDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(today);
  const activeProjects = projects.filter((project) => !/complete|closed|archived/i.test(project.status || ""));
  const leadProject = activeProjects[0];
  const urgentItems = schedule
    .filter((item) => item.status !== "Done" && item.endDate)
    .map((item) => ({ item, remaining: dayDistance(item.endDate) }))
    .filter(({ remaining }) => remaining !== null && remaining <= 7)
    .sort((a, b) => (a.remaining ?? 1000) - (b.remaining ?? 1000))
    .slice(0, 4);
  const pendingApprovals = approvals
    .filter((approval) => /pending|awaiting|requested/i.test(approval.status))
    .slice(0, 3);
  const isPageLoading = user.isLoading || projectsQuery.isLoading || summaryQuery.isLoading;
  const signals = [
    { label: "Active sites", value: summary?.activeProjects, icon: HardHat, href: "/projects", tone: "text-[#e4c879]" },
    ...(canSeeApprovals ? [{ label: "For approval", value: summary?.awaitingApproval, icon: ClipboardCheck, href: "/approvals", tone: "text-[#edb978]" }] : []),
    { label: "Unread", value: summary?.unreadMessages, icon: MessageSquare, href: "/messages", tone: "text-[#bed0c0]" },
    { label: "New 360s", value: summary?.new360Photos, icon: CheckCircle2, href: "/projects", tone: "text-[#bdc8bf]" },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#11110f] text-[#f4f0e7]" data-testid="page-mobile-overview">
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-12 pt-5 sm:px-7 sm:pt-8">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c6a15b]/35 bg-[#c6a15b]/10 text-[#d9b66c]">
              <HardHat className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.21em] text-[#f4f0e7]">Luminova</p>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/40">Field brief</p>
            </div>
          </div>
          <p className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-white/45" data-testid="text-overview-date">
            {greetingDate}
          </p>
        </header>

        <section className="relative isolate overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#24231f] p-5 sm:p-7" data-testid="overview-hero">
          {leadProject?.exteriorImage && (
            <img
              src={leadProject.exteriorImage}
              alt=""
              className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35"
              data-testid={`img-lead-project-${leadProject.id}`}
            />
          )}
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(17,17,15,.96)_0%,rgba(17,17,15,.8)_48%,rgba(17,17,15,.3)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(17,17,15,.6),transparent_60%)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.19em] text-[#d6b56e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#d6b56e]" />
                Site pulse <span className="text-white/35">/</span> {activeProjects.length} active
              </p>
              <h1 className="max-w-[540px] text-[2rem] font-extrabold leading-[1.03] tracking-[-0.055em] sm:text-4xl">
                The work, at a glance.
              </h1>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-white/60">
                The few things worth checking before the next site walk.
              </p>
            </div>
            <Link
              href="/projects"
              data-testid="link-all-projects"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 text-[11px] font-semibold text-white/85 transition hover:border-[#d6b56e]/60 hover:text-[#e6c87f]"
            >
              Projects <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {leadProject && (
            <Link
              href={`/projects/${leadProject.id}`}
              data-testid={`link-feature-project-${leadProject.id}`}
              className="mt-7 flex max-w-[580px] items-end justify-between gap-4 border-t border-white/15 pt-4"
            >
              <div className="min-w-0">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">In focus</p>
                <p className="truncate text-lg font-bold tracking-[-0.025em]">{leadProject.name}</p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-white/55">
                  <MapPin className="h-3 w-3 shrink-0 text-[#d6b56e]" aria-hidden="true" />
                  {leadProject.address || leadProject.region}
                </p>
              </div>
              <div className="w-24 shrink-0">
                <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-white/45">Progress</span><span className="text-[#e0c276]">{Math.round(leadProject.progress || 0)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#c6a15b]" style={{ width: `${Math.min(100, Math.max(0, leadProject.progress || 0))}%` }} />
                </div>
              </div>
            </Link>
          )}
          {!leadProject && !projectsQuery.isLoading && !projectsQuery.isError && (
            <div className="mt-6 border-t border-white/15 pt-4 text-xs text-white/55" data-testid="empty-active-project">
              No active projects in this workspace.
            </div>
          )}
        </section>

        <section className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Portfolio signals">
          {signals.map(({ label, value, icon: Icon, href, tone }) => (
            <Link
              href={href}
              key={label}
              data-testid={`link-signal-${label.toLowerCase().replaceAll(" ", "-")}`}
              className="rounded-xl border border-white/[0.08] bg-[#1b1b18] p-3.5 transition hover:border-[#c6a15b]/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-white/45">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden="true" />
              </div>
              <p className="mt-2 text-[1.65rem] font-bold leading-none tracking-[-0.05em] tabular-nums" data-testid={`value-signal-${label.toLowerCase().replaceAll(" ", "-")}`}>
                {summaryQuery.isLoading ? <span className="skeleton-line inline-block h-7 w-10 align-middle" /> : invalidSummaryPayload ? "—" : value ?? "—"}
              </p>
            </Link>
          ))}
        </section>

        <div className="mt-7 grid gap-7 md:grid-cols-[1.08fr_.92fr]">
          <section aria-labelledby="schedule-heading" data-testid="section-time-sensitive">
            <SectionHeading index="01" title="Next on site" detail="7 day window" />
            {user.isError && <LoadError label="workspace access" retry={() => void user.refetch()} busy={user.isFetching} />}
            {!user.isLoading && canSeeSchedule && (scheduleQuery.isError || invalidSchedulePayload) && (
              <LoadError label="schedule" retry={() => void scheduleQuery.refetch()} busy={scheduleQuery.isFetching} />
            )}
            {scheduleQuery.isLoading && canSeeSchedule && (
              <div className="space-y-2" aria-label="Loading schedule" data-testid="loading-schedule">
                {[0, 1, 2].map((item) => <div key={item} className="skeleton-line h-[76px] rounded-xl" />)}
              </div>
            )}
            {!canSeeSchedule && !user.isLoading && !user.isError && (
              <div className="rounded-xl border border-white/[0.08] bg-[#1b1b18] p-4 text-xs text-white/55" data-testid="status-schedule-unavailable">
                Schedule overview is not available for this account.
              </div>
            )}
            {canSeeSchedule && !scheduleQuery.isLoading && !scheduleQuery.isError && !invalidSchedulePayload && (
              <div className="space-y-2">
                {urgentItems.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.08] bg-[#1b1b18] px-4 py-5" data-testid="empty-schedule-window">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> No due work in the next 7 days</p>
                    <p className="mt-1.5 text-[11px] text-white/40">Nothing time-sensitive is listed right now.</p>
                  </div>
                ) : urgentItems.map(({ item, remaining }) => (
                  <Link
                    href={`/projects/${item.projectId}`}
                    key={item.id}
                    data-testid={`link-schedule-item-${item.id}`}
                    className="flex min-h-[76px] items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1b1b18] px-3.5 py-3 transition hover:border-[#c6a15b]/40"
                  >
                    <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg ${remaining !== null && remaining < 0 ? "bg-rose-300/10 text-rose-200" : "bg-[#c6a15b]/10 text-[#e4c879]"}`}>
                      <CalendarDays className="mb-0.5 h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono text-[9px]">{shortDate(item.endDate)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white/90">{item.name}</p>
                      <p className="mt-1 truncate text-[10px] text-white/45">{item.projectName} <span className="px-1 text-white/20">/</span> {item.groupName}</p>
                    </div>
                    <span className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] ${remaining !== null && remaining < 0 ? "text-rose-200" : "text-[#dbbe77]"}`}>
                      {remaining !== null && remaining < 0 ? `${Math.abs(remaining)}d late` : remaining === 0 ? "Today" : `${remaining}d`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {canSeeSchedule && (
              <Link href="/schedule" data-testid="link-full-schedule" className="mt-2 flex min-h-10 items-center justify-between rounded-lg px-3 text-[11px] font-semibold text-white/55 transition hover:bg-white/[0.04] hover:text-[#e4c879]">
                Portfolio schedule <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </section>

          <section aria-labelledby="exposure-heading" data-testid="section-project-exposure">
            <SectionHeading index="02" title={hasEnabledBudgets ? "Budget & approvals" : "Financials & approvals"} detail="Portfolio" />
            <div className="rounded-xl border border-white/[0.08] bg-[#1b1b18] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/45">Client invoice revenue</p>
                  <p className="mt-1.5 text-xl font-bold tracking-[-0.04em] tabular-nums" data-testid="value-client-revenue">{money(summary?.invoiced)}</p>
                </div>
                <Wallet className="mt-0.5 h-4 w-4 text-[#d6b56e]" aria-hidden="true" />
              </div>
              {hasEnabledBudgets && (
                <div className="mt-4 border-t border-white/[0.08] pt-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/45">Recorded internal costs / budget</p>
                  <p className="mt-1.5 text-lg font-bold tracking-[-0.04em] tabular-nums" data-testid="value-budget-usage">
                    {money(financialSummaryQuery.data?.invoicedExpenses)}
                    <span className="px-1.5 text-xs font-medium text-white/35">/</span>
                    <span className="text-base text-white/60">{money(summary?.budgeted)}</span>
                  </p>
                  {typeof summary?.budgeted === "number" && summary.budgeted > 0 && typeof financialSummaryQuery.data?.invoicedExpenses === "number" && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[#c6a15b]" style={{ width: `${Math.min(100, Math.max(0, (financialSummaryQuery.data.invoicedExpenses / summary.budgeted) * 100))}%` }} />
                      </div>
                      <p className="mt-1.5 font-mono text-[9px] text-white/40">{money(moneyRemaining(summary.budgeted, financialSummaryQuery.data.invoicedExpenses))} remaining</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {user.isLoading && canSeeApprovals === false ? (
              <div className="skeleton-line mt-2 h-[82px] rounded-xl" />
            ) : canSeeApprovals ? (
              <div className="mt-2 space-y-2">
                {approvalsQuery.isLoading && <div className="skeleton-line h-[82px] rounded-xl" data-testid="loading-approvals" />}
                {(approvalsQuery.isError || invalidApprovalsPayload) && <LoadError label="approvals" retry={() => void approvalsQuery.refetch()} busy={approvalsQuery.isFetching} />}
                {!approvalsQuery.isLoading && !approvalsQuery.isError && !invalidApprovalsPayload && (pendingApprovals.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.08] bg-[#1b1b18] p-4" data-testid="empty-pending-approvals">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white/80"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Nothing waiting for sign-off</p>
                  </div>
                ) : pendingApprovals.map((approval) => (
                  <Link
                    href="/approvals"
                    key={approval.id}
                    data-testid={`link-approval-${approval.id}`}
                    className="flex items-center gap-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] px-3.5 py-3 transition hover:border-amber-200/35"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200/10 text-[#e4c879]">
                      {approval.overage > 0 ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-white/90">{approval.tradeLabel || approval.vendor}</span>
                      <span className="mt-1 block truncate text-[10px] text-white/45">
                        {approval.projectName} · {approval.kind}
                        {approval.approvalReason === "external_authorization_required" ? " · External authorization required outside the app" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[11px] text-[#e4c879]">{money(approval.amount)}</span>
                      {approval.overage > 0 && <span className="mt-1 block font-mono text-[9px] text-rose-200">+{money(approval.overage)} over</span>}
                    </span>
                  </Link>
                )))}
              </div>
            ) : (
              !user.isLoading && !user.isError && (
                <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#1b1b18] p-4" data-testid="status-approvals-restricted">
                  <p className="text-xs text-white/55">Approval details are limited to managers.</p>
                </div>
              )
            )}
            {canSeeApprovals && <Link href="/approvals" data-testid="link-all-approvals" className="mt-2 flex min-h-10 items-center justify-between rounded-lg px-3 text-[11px] font-semibold text-white/55 transition hover:bg-white/[0.04] hover:text-[#e4c879]">
              Open approvals <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>}
          </section>
        </div>

        <section className="mt-7" data-testid="section-projects">
          <SectionHeading index="03" title="On the ground" detail={projectsQuery.isLoading ? "Loading" : `${activeProjects.length} active`} />
          {projectsQuery.isError || invalidProjectsPayload ? (
            <LoadError label="projects" retry={() => void projectsQuery.refetch()} busy={projectsQuery.isFetching} />
          ) : projectsQuery.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2" aria-label="Loading projects" data-testid="loading-projects">
              {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton-line h-[94px] rounded-xl" />)}
            </div>
          ) : activeProjects.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#1b1b18] px-4 py-6 text-center" data-testid="empty-projects">
              <HardHat className="mx-auto h-5 w-5 text-white/30" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-white/75">No active projects</p>
              <p className="mt-1 text-[11px] text-white/40">Projects will appear here when available.</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeProjects.slice(0, 6).map((project) => (
                <Link
                  href={`/projects/${project.id}`}
                  key={project.id}
                  data-testid={`card-project-${project.id}`}
                  className="group flex min-h-[92px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1b18] transition hover:border-[#c6a15b]/40"
                >
                  <div className="relative w-[76px] shrink-0 bg-[#282721]">
                    {project.exteriorImage ? (
                      <img src={project.exteriorImage} alt="" className="h-full w-full object-cover opacity-75 transition group-hover:opacity-100" data-testid={`img-project-${project.id}`} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#c6a15b]/55"><HardHat className="h-5 w-5" aria-hidden="true" /></div>
                    )}
                    <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] text-white/90">{Math.round(project.progress || 0)}%</span>
                  </div>
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13px] font-bold text-white/90">{project.name}</p>
                      <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-white/25 transition group-hover:text-[#e4c879]" aria-hidden="true" />
                    </div>
                    <p className="mt-1 truncate text-[10px] text-white/45">{project.address || project.region}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[9px] font-mono uppercase tracking-[0.1em] text-[#d7bb76]">{project.status || "In progress"}</span>
                      <span className="shrink-0 font-mono text-[9px] text-white/40">Target {shortDate(project.targetDate)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-7" data-testid="section-recent-activity">
          <SectionHeading index="04" title="Latest movement" detail="Recent" />
          {summaryQuery.isError || invalidSummaryPayload ? (
            <LoadError label="dashboard" retry={() => void summaryQuery.refetch()} busy={summaryQuery.isFetching} />
          ) : summaryQuery.isLoading ? (
            <div className="space-y-2" aria-label="Loading activity" data-testid="loading-activity">
              {[0, 1].map((item) => <div key={item} className="skeleton-line h-[62px] rounded-xl" />)}
            </div>
          ) : activity.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#1b1b18] p-4 text-xs text-white/50" data-testid="empty-activity">
              No recent project activity recorded.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-[#1b1b18] px-3.5" data-testid="list-recent-activity">
              {activity.slice(0, 3).map((entry) => (
                <div className="flex gap-3 py-3" key={entry.id} data-testid={`item-activity-${entry.id}`}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c6a15b]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-white/85">{entry.title}</p>
                    <p className="mt-1 line-clamp-1 text-[10px] text-white/45">{entry.description}</p>
                    <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.09em] text-white/30">{entry.author} <span className="px-1">·</span> {shortDate(entry.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {(summaryQuery.isError
          || invalidSummaryPayload
          || projectsQuery.isError
          || invalidProjectsPayload
          || (canSeeSchedule && (scheduleQuery.isError || invalidSchedulePayload))
          || (canSeeApprovals && (approvalsQuery.isError || invalidApprovalsPayload))) && (
          <p className="mt-5 flex items-center gap-2 text-[10px] text-white/35" data-testid="status-partial-overview">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Some field information is unavailable. Retry the affected section above.
          </p>
        )}
        {!isPageLoading && <div className="mt-7 border-t border-white/[0.08] pt-3 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-white/25" data-testid="text-overview-footer">Luminova · field brief</div>}
      </div>
    </div>
  );
}
