import * as React from "react"
import { useLocation } from "wouter"
import {
  getGetProjectsQueryKey,
  useGetProjects,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2, Grid2X2, List, Search, SlidersHorizontal, X } from "lucide-react"
import { ProjectCard } from "@/components/workspace/project-card"

const STATUSES = ["Pre-construction", "Planning", "Active", "In progress", "On hold", "Completed", "Rejected for bid"]
const REGION_OPTIONS_QUERY_KEY = [...getGetProjectsQueryKey(), "region-options"] as const

export function getProjectRegionOptions(projects: Array<{ region?: string }> | undefined) {
  return Array.from(new Set(
    projects
      ?.map((project) => project.region)
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0) ?? [],
  )).sort()
}

export function getProjectClientOptions(projects: Array<{ clientName?: string }> | undefined) {
  return Array.from(new Set(
    projects
      ?.map((project) => project.clientName)
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0) ?? [],
  )).sort()
}

export default function Projects() {
  const [, setLocation] = useLocation()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [region, setRegion] = React.useState("")
  const [client, setClient] = React.useState("")
  const [view, setView] = React.useState<"grid" | "list">("grid")

  const params = {
    search: search || undefined,
    status: status || undefined,
    region: region || undefined,
    client: client || undefined,
  }
  const { data: projects, isLoading } = useGetProjects(params, {
    query: { queryKey: getGetProjectsQueryKey(params) },
  })
  const { data: allProjects, isLoading: areRegionsLoading } = useGetProjects(undefined, {
    query: { queryKey: REGION_OPTIONS_QUERY_KEY },
  })
  const regionOptions = React.useMemo(() => getProjectRegionOptions(allProjects), [allProjects])
  const clientOptions = React.useMemo(() => getProjectClientOptions(allProjects), [allProjects])

  React.useEffect(() => {
    if (region && allProjects && !regionOptions.includes(region)) {
      setRegion("")
    }
  }, [allProjects, region, regionOptions])

  React.useEffect(() => {
    if (client && allProjects && !clientOptions.includes(client)) {
      setClient("")
    }
  }, [allProjects, client, clientOptions])

  const clearFilters = () => {
    setSearch("")
    setStatus("")
    setRegion("")
    setClient("")
  }
  const hasFilters = Boolean(search || status || region || client)

  return (
    <>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
        <div className="mx-auto max-w-[1600px] space-y-7 p-4 sm:p-6 md:p-8">
          <header className="hud-header hud-frame flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-4"><span className="hud-kicker">Project network</span><span className="hud-index">MOD/02</span></div>
              <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">All Projects</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Review every active, planned, paused, and completed build from one workspace.
              </p>
            </div>
            <div role="group" aria-label="Layout" className="hud-segment self-start lg:self-auto">
              <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 className="h-3.5 w-3.5" />Grid</button>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view"><List className="h-3.5 w-3.5" />List</button>
            </div>
          </header>

          <section className="filter-dock p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Filter projects
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_200px_200px_220px_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, address, or client"
                  className="bg-background/70 pl-9"
                />
              </div>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Project status"
                className="hud-select"
              >
                <option value="">All statuses</option>
                {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                aria-label="Project region"
                disabled={areRegionsLoading && regionOptions.length === 0}
                className="hud-select"
              >
                <option value="">All regions</option>
                {regionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select
                value={client}
                onChange={(event) => setClient(event.target.value)}
                aria-label="Project client"
                disabled={areRegionsLoading && clientOptions.length === 0}
                className="hud-select"
              >
                <option value="">All clients</option>
                {clientOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </section>

          <div className="flex items-center gap-4">
            <p className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {isLoading ? "Scanning projects" : `${projects?.length ?? 0} projects found`}
            </p>
            <div aria-hidden="true" className="hud-rule flex-1" />
          </div>

          {isLoading ? (
            <div className={view === "grid" ? "pgrid" : "pgrid-list"}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-[21rem] skeleton-line rounded-2xl" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <div className="filter-dock py-20 text-center">
              <Building2 className="mx-auto mb-4 h-12 w-12 text-primary/50" />
              <h2 className="text-xl font-semibold">No matching projects</h2>
              <p className="mt-2 text-sm text-muted-foreground">Clear or adjust the filters to expand the results.</p>
            </div>
          ) : (
            <div className={view === "grid" ? "pgrid" : "pgrid-list"}>
              {projects?.map((project) => (
                <ProjectCard key={project.id} project={project} layout={view === "list" ? "row" : "tile"} onOpen={() => setLocation(`/projects/${project.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
