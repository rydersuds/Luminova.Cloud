import * as React from "react"
import { getSearchWorkspaceQueryKey, useSearchWorkspace, type WorkspaceSearchResult } from "@workspace/api-client-react"
import { useLocation } from "wouter"
import {
  Building2,
  FileText,
  FolderKanban,
  Loader2,
  MessageSquare,
  Search,
  Users,
  UserCog,
} from "lucide-react"
import { Input } from "@/components/ui/input"

const DESTINATIONS = [
  { id: "projects", title: "All Projects", subtitle: "Browse every project", href: "/projects", icon: FolderKanban },
  { id: "vendors", title: "Trades & Vendors", subtitle: "Vendor directory and profiles", href: "/trades", icon: Users },
  { id: "quotes", title: "Vendor Quotes", subtitle: "Quotes submitted to Luminova", href: "/quotes", icon: FileText },
  { id: "financials", title: "Financials", subtitle: "Invoices and portfolio totals", href: "/invoices", icon: FileText },
  { id: "communications", title: "Communications", subtitle: "Project messages", href: "/messages", icon: MessageSquare },
  { id: "users", title: "Users & Roles", subtitle: "Workspace access", href: "/users", icon: UserCog },
]

const resultIcons = {
  project: Building2,
  vendor: Users,
  quote: FileText,
  invoice: FileText,
  message: MessageSquare,
} satisfies Record<WorkspaceSearchResult["kind"], React.ElementType>

export function GlobalSearch() {
  const [, navigate] = useLocation()
  const [value, setValue] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [value])

  const search = useSearchWorkspace(
    { query, limit: 12 },
    { query: { queryKey: getSearchWorkspaceQueryKey({ query, limit: 12 }), enabled: query.length >= 2, retry: false } },
  )
  const normalized = value.trim().toLowerCase()
  const destinations = normalized.length >= 2
    ? DESTINATIONS.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(normalized))
    : []
  const records = query === value.trim() ? search.data ?? [] : []
  const showPanel = open && value.trim().length > 0

  const goTo = (href: string) => {
    setOpen(false)
    setValue("")
    navigate(href)
  }

  return (
    <div
      className="relative w-full sm:w-[360px]"
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false)
          event.currentTarget.querySelector("input")?.blur()
        }
      }}
    >
      <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <Input
        type="search"
        aria-label="Search the workspace"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        placeholder="Search projects, vendors, messages…"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setOpen(true)
        }}
        className="w-full border-border/50 bg-background/70 pl-9 font-mono text-sm backdrop-blur-sm focus-visible:ring-primary/50"
      />

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Workspace search results"
          className="absolute right-0 top-[calc(100%+0.6rem)] z-50 max-h-[min(65vh,520px)] w-full min-w-0 overflow-y-auto rounded-2xl border border-border bg-card/98 p-2 text-card-foreground shadow-2xl backdrop-blur-xl sm:min-w-[420px]"
        >
          {value.trim().length < 2 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Type at least two characters to search.</p>
          ) : (
            <>
              {destinations.length > 0 && (
                <SearchGroup label="Workspaces">
                  {destinations.map((item) => (
                    <SearchButton key={item.id} title={item.title} subtitle={item.subtitle} icon={item.icon} onClick={() => goTo(item.href)} />
                  ))}
                </SearchGroup>
              )}
              {search.isLoading && (
                <div className="flex items-center gap-2 px-3 py-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching workspace…
                </div>
              )}
              {!search.isLoading && records.length > 0 && (
                <SearchGroup label="Records">
                  {records.map((result) => (
                    <SearchButton
                      key={`${result.kind}-${result.id}`}
                      title={result.title}
                      subtitle={result.subtitle}
                      icon={resultIcons[result.kind]}
                      badge={result.kind}
                      onClick={() => goTo(result.href)}
                    />
                  ))}
                </SearchGroup>
              )}
              {!search.isLoading && !search.isError && destinations.length === 0 && records.length === 0 && query.length >= 2 && (
                <p className="px-3 py-5 text-sm text-muted-foreground">No matching workspace records.</p>
              )}
              {search.isError && (
                <p role="alert" className="px-3 py-5 text-sm text-destructive">Search is unavailable. Try again.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="py-1">
      <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      {children}
    </section>
  )
}

function SearchButton({ title, subtitle, icon: Icon, badge, onClick }: {
  title: string
  subtitle: string
  icon: React.ElementType
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected="false"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {badge && <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{badge}</span>}
    </button>
  )
}