import type { Project } from "@workspace/api-client-react"
import { Building2, MapPin, ArrowUpRight } from "lucide-react"
import { cn, formatCurrency, formatDateOnly, formatDaysRemaining, getDaysRemaining } from "@/lib/utils"
import { ClientIdentity } from "@/components/client-identity"
import { StatusPill } from "./status-pill"
import { WireframeBuilding } from "./wireframe-building"

type Props = {
  project: Project
  onOpen: () => void
  layout?: "tile" | "row" | "compact"
}

export function ProjectCard({ project, onOpen, layout = "tile" }: Props) {
  const days = getDaysRemaining(project.targetDate)
  const overdue = days !== null && days < 0
  const isRow = layout === "row"

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen() }}
      className={cn("pcard group", isRow && "pcard-row")}
    >
      <div className={cn("pcard-media", isRow ? "h-36 sm:h-auto sm:min-h-[9rem]" : "h-36")}>
        {project.exteriorImage ? (
          <img src={project.exteriorImage} alt={project.name} loading="lazy" className="pcard-img" />
        ) : (
          <div className="pcard-blank"><WireframeBuilding seed={project.id} progress={project.progress} className="pcard-wireframe" /></div>
        )}
        <div className="pcard-shade" />
        <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-3">
          <StatusPill status={project.status} />
          <span className="pcard-go" aria-hidden="true"><ArrowUpRight className="h-4 w-4" /></span>
        </div>
        <div className="absolute inset-x-3 bottom-3 text-white">
          <h3 title={project.name} className="font-heading text-lg font-extrabold leading-tight tracking-[-0.02em] break-words line-clamp-2">{project.name}</h3>
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-[11px] text-white/75">
            <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-[hsl(var(--brand-gold))]" />
            <span className="min-w-0 break-words line-clamp-2" title={project.address}>{project.address}</span>
          </p>
        </div>
      </div>

      <div className="pcard-body">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="pcard-k">Completion</p>
            <p className="font-heading text-2xl font-extrabold tabular-nums leading-none tracking-tight">{project.progress}<span className="text-sm opacity-60">%</span></p>
          </div>
          <div className="text-right">
            <p className="pcard-k">Time remaining</p>
            <p className={cn("mt-0.5 text-xs font-semibold", overdue ? "text-[hsl(var(--ember))]" : "")}>{formatDaysRemaining(project.targetDate)}</p>
          </div>
        </div>
        <div className="pcard-gauge" role="progressbar" aria-label={`${project.name} completion`} aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
        </div>

        {layout !== "compact" && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div className="min-w-0"><dt className="pcard-k">Project manager</dt><dd className="break-words font-medium">{project.pmName || "Unassigned"}</dd></div>
            <div className="min-w-0"><dt className="pcard-k">End date</dt><dd className="break-words font-medium">{formatDateOnly(project.targetDate)}</dd></div>
            {project.budgetEnabled && <div className="min-w-0"><dt className="pcard-k">Budget</dt><dd className="break-words font-semibold tabular-nums">{formatCurrency(project.budgeted)}</dd></div>}
            <div className="min-w-0"><dt className="pcard-k">Region</dt><dd className="break-words font-medium">{project.region}</dd></div>
          </dl>
        )}

        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-white/10 pt-2.5">
          <ClientIdentity name={project.clientName} logoUrl={project.clientLogoUrl} size="sm" />
          <div className="min-w-0">
            <p className="pcard-k">Client</p>
            <p className="truncate text-xs font-medium">{project.clientName}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
