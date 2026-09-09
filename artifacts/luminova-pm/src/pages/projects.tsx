import * as React from "react"
import { useLocation } from "wouter"
import {
  getGetProjectsQueryKey,
  useGetProjects,
} from "@workspace/api-client-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Building2, Grid2X2, List, MapPin, Search, SlidersHorizontal, X } from "lucide-react"
import { cn, formatCurrency, formatDate, getStatusColor } from "@/lib/utils"

const STATUSES = ["Pre-construction", "Planning", "Active", "In progress", "On hold", "Completed", "Rejected for bid"]
const REGIONS = ["Calgary", "Canmore", "Edmonton"]

export default function Projects() {
  const [, setLocation] = useLocation()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [region, setRegion] = React.useState("")
  const [view, setView] = React.useState<"grid" | "list">("grid")

  const params = {
    search: search || undefined,
    status: status || undefined,
    region: region || undefined,
  }
  const { data: projects, isLoading } = useGetProjects(params, {
    query: { queryKey: getGetProjectsQueryKey(params) },
  })

  const clearFilters = () => {
    setSearch("")
    setStatus("")
    setRegion("")
  }
  const hasFilters = Boolean(search || status || region)

  return (
    <AppLayout>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
        <div className="mx-auto max-w-[1600px] space-y-7 p-4 sm:p-6 md:p-8">
          <header className="flex flex-col gap-5 border-b border-border/60 pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-px w-6 bg-primary" />
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Project network</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">All Projects</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Review every active, planned, paused, and completed build from one workspace.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start lg:self-auto">
              <Button
                type="button"
                size="icon"
                variant={view === "grid" ? "default" : "outline"}
                onClick={() => setView("grid")}
                aria-label="Grid view"
              >
                <Grid2X2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={view === "list" ? "default" : "outline"}
                onClick={() => setView("list")}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <section className="glass-panel tech-border p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Filter projects
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_220px_220px_auto]">
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
                className="h-10 border border-border bg-background/70 px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">All statuses</option>
                {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="h-10 border border-border bg-background/70 px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">All regions</option>
                {REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </section>

          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {isLoading ? "Scanning projects" : `${projects?.length ?? 0} projects found`}
            </p>
          </div>

          {isLoading ? (
            <div className={cn("grid gap-5", view === "grid" ? "md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index} className="h-72 animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <div className="glass-panel py-20 text-center">
              <Building2 className="mx-auto mb-4 h-12 w-12 text-primary/50" />
              <h2 className="text-xl font-semibold">No matching projects</h2>
              <p className="mt-2 text-sm text-muted-foreground">Clear or adjust the filters to expand the results.</p>
            </div>
          ) : (
            <div className={cn("grid gap-5", view === "grid" ? "md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
              {projects?.map((project) => (
                <Card
                  key={project.id}
                  onClick={() => setLocation(`/projects/${project.id}`)}
                  className={cn(
                    "group cursor-pointer overflow-hidden border-border/60 bg-card/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5",
                    view === "list" && "sm:grid sm:grid-cols-[260px_1fr]",
                  )}
                >
                  <div className={cn("relative h-48 overflow-hidden bg-muted", view === "list" && "sm:h-full")}>
                    {project.exteriorImage ? (
                      <img
                        src={project.exteriorImage}
                        alt={project.name}
                        className="h-full w-full object-cover saturate-110 transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                        <div className="flex h-full items-center justify-center bg-muted/50">
                        <Building2 className="h-12 w-12 text-primary/45" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <Badge
                      variant={getStatusColor(project.status) as any}
                      className="absolute left-4 top-4 rounded-none bg-background/90 font-mono text-[10px] uppercase tracking-wider backdrop-blur"
                    >
                      {project.status}
                    </Badge>
                  </div>
                    <CardContent className="flex min-w-0 flex-col gap-5 p-5">
                      <div className="min-w-0">
                        <h2 className="break-words text-xl font-bold">{project.name}</h2>
                        <div className="mt-2 flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 break-words">{project.address}</span>
                      </div>
                    </div>
                      <div className="grid grid-cols-1 gap-4 border-y border-border/50 py-4 text-sm min-[420px]:grid-cols-2">
                        <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Project manager</p>
                          <p className="mt-1 break-words font-medium">{project.pmName}</p>
                      </div>
                        <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Target</p>
                          <p className="mt-1 break-words font-medium">{formatDate(project.targetDate)}</p>
                      </div>
                        <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Budget</p>
                          <p className="mt-1 break-words font-semibold tabular-nums">{formatCurrency(project.budgeted)}</p>
                      </div>
                        <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Region</p>
                          <p className="mt-1 break-words font-medium">{project.region}</p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
                        <span className="text-muted-foreground">Completion</span>
                        <span className="text-primary">{project.progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden bg-muted">
                        <div className="h-full bg-primary transition-all duration-700" style={{ width: `${project.progress}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}