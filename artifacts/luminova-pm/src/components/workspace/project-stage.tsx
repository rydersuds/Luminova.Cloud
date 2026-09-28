import { useMemo, useState } from "react"
import { Link } from "wouter"
import type { Project } from "@workspace/api-client-react"
import { ArrowLeft, ArrowRight, Building2, MapPin } from "lucide-react"
import { cn, formatDaysRemaining, getDaysRemaining } from "@/lib/utils"
import { StatusPill } from "./status-pill"

const LIVE = new Set(["Active", "In progress"])

/** Project highlights carousel. Uses only the projects the user can already see. */
export function ProjectStage({ projects, loading }: { projects: Project[] | undefined; loading: boolean }) {
  const ordered = useMemo(() => {
    const list = [...(projects ?? [])]
    const score = (p: Project) => (p.exteriorImage ? 2 : 0) + (LIVE.has(p.status) ? 1 : 0)
    return list.sort((a, b) => score(b) - score(a))
  }, [projects])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIndex = Math.max(0, ordered.findIndex((p) => p.id === selectedId))
  const featured = ordered[selectedIndex]
  const visibleStart = Math.min(Math.max(selectedIndex - 2, 0), Math.max(ordered.length - 5, 0))
  const visibleProjects = ordered.slice(visibleStart, visibleStart + 5)
  const selectOffset = (offset: number) => {
    setSelectedId(ordered[(selectedIndex + offset + ordered.length) % ordered.length].id)
  }

  if (loading) return <div className="stage stage-loading skeleton-line" aria-busy="true" aria-label="Loading project highlights" />
  if (!featured) return null

  const days = getDaysRemaining(featured.targetDate)

  return (
    <section aria-label="Project highlights" className="stage" data-testid="dashboard-project-stage">
      {featured.exteriorImage ? (
        <img key={featured.id} src={featured.exteriorImage} alt="" className="stage-img" />
      ) : (
        <div className="stage-blank"><Building2 className="h-24 w-24" /></div>
      )}
      <div className="stage-shade" />

      <div className="relative z-10 flex h-full flex-col justify-between gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/70">Project highlights</span>
            <StatusPill status={featured.status} />
          </div>
          <div className="flex items-center gap-2">
            <span className="stage-count" aria-hidden="true">{String(selectedIndex + 1).padStart(2, "0")} <span className="text-white/45">/ {String(ordered.length).padStart(2, "0")}</span></span>
            {ordered.length > 1 && (
              <div role="group" aria-label="Browse project highlights" className="flex items-center gap-1">
                <button type="button" className="stage-nav" aria-label="Previous project highlight" data-testid="button-stage-previous" onClick={() => selectOffset(-1)}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button type="button" className="stage-nav" aria-label="Next project highlight" data-testid="button-stage-next" onClick={() => selectOffset(1)}>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        <span className="sr-only" aria-live="polite">Project {selectedIndex + 1} of {ordered.length}: {featured.name}</span>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-gold))]">{featured.clientName}</p>
            <h2 className="stage-title">{featured.name}</h2>
            <p className="mt-2 flex items-start gap-2 text-xs text-white/80">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />{featured.address}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-white">
              <div>
                <p className="stage-k">Completion</p>
                <p className="font-heading text-3xl font-extrabold tabular-nums leading-none">{featured.progress}<span className="text-lg text-white/60">%</span></p>
              </div>
              <div>
                <p className="stage-k">Time remaining</p>
                <p className={cn("text-sm font-semibold", days !== null && days < 0 && "text-[hsl(var(--ember))]")}>{formatDaysRemaining(featured.targetDate)}</p>
              </div>
              <div>
                <p className="stage-k">Project manager</p>
                <p className="text-sm font-semibold">{featured.pmName || "Unassigned"}</p>
              </div>
            </div>
            <div className="stage-gauge mt-3" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, featured.progress))}%` }} /></div>
          </div>

          <Link href={`/projects/${featured.id}`} data-testid="link-stage-open-project" className="stage-cta">
            Open project <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {ordered.length > 1 && (
          <div role="group" aria-label="Choose featured project" className="flex gap-2 overflow-x-auto pb-1">
            {visibleProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === featured.id}
                onClick={() => setSelectedId(p.id)}
                data-testid={`button-stage-select-${p.id}`}
                className="stage-thumb"
              >
                {p.exteriorImage ? <img src={p.exteriorImage} alt="" className="h-9 w-12 rounded object-cover" /> : <span className="grid h-9 w-12 place-items-center rounded bg-white/10"><Building2 className="h-4 w-4" /></span>}
                <span className="max-w-[10rem] truncate text-left text-xs font-semibold">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
