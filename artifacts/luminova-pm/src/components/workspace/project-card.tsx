import type { Project } from "@workspace/api-client-react"
import { Building2, MapPin, ArrowUpRight } from "lucide-react"
import { cn, formatCurrency, formatDateOnly, formatDaysRemaining, getDaysRemaining } from "@/lib/utils"
import { ClientIdentity } from "@/components/client-identity"
import { StatusPill } from "./status-pill"

type Props = {
  project: Project
  onOpen: () => void
  layout?: "tile" | "row" | "compact"
}

export function ProjectCard({ project, onOpen, layout = "tile" }: Props) {
  const days = getDaysRemaining(project.targetDate)
  const overdue = days !== null && days < 0
  const isRow = layout === "row"
  const compact = layout === "compact"

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen() }}
      className={cn("pcard group", isRow && "pcard-row")}
    >
      <div className={cn("pcard-media", compact ? "h-44" : isRow ? "h-52 sm:h-auto" : "h-64")}>
        {project.exteriorImage ? (
          <img src={project.exteriorImage} alt={project.name} loading="lazy" className="pcard-img" />
        ) : (
          <div className="pcard-blank"><Building2 className="h-12 w-12" /></div>
        )}
        <div className="pcard-shade" />
        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
          <StatusPill status={project.status} />
          <span className="pcard-go" aria-hidden="true"><ArrowUpRight className="h-4 w-4" /></span>
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <h3 className={cn("font-heading font-extrabold leading-[0.95] tracking-[-0.03em] break-words", compact ? "text-2xl" : "text-[1.75rem]")}>{project.name}</h3>
          <p className="mt-2 flex min-w-0 items-start gap-1.5 text-xs text-white/80">
            <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-[hsl(var(--brand-gold))]" />
            <span className="min-w-0 break-words">{project.address}</span>
          </p>
        </div>
      </div>

      <div className="pcard-body">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="pcard-k">Completion</p>
            <p className="font-heading text-4xl font-extrabold tabular-nums leading-none tracking-tight">{project.progress}<span className="text-lg text-muted-foreground">%</span></p>
          </div>
          <div className="text-right">
            <p className="pcard-k">Time remaining</p>
            <p className={cn("mt-1 text-sm font-semibold", overdue ? "text-destructive" : "text-foreground")}>{formatDaysRemaining(project.targetDate)}</p>
          </div>
        </div>
        <div className="pcard-gauge" role="progressbar" aria-label={`${project.name} completion`} aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
        </div>

        {!compact && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="min-w-0"><dt className="pcard-k">Project manager</dt><dd className="mt-0.5 break-words font-medium">{project.pmName || "Unassigned"}</dd></div>
            <div className="min-w-0"><dt className="pcard-k">End date</dt><dd className="mt-0.5 break-words font-medium">{formatDateOnly(project.targetDate)}</dd></div>
            <div className="min-w-0"><dt className="pcard-k">Budget</dt><dd className="mt-0.5 break-words font-semibold tabular-nums">{formatCurrency(project.budgeted)}</dd></div>
            <div className="min-w-0"><dt className="pcard-k">Region</dt><dd className="mt-0.5 break-words font-medium">{project.region}</dd></div>
          </dl>
        )}

        <div className="mt-auto flex min-w-0 items-center gap-2.5 border-t border-border/70 pt-3">
          <ClientIdentity name={project.clientName} logoUrl={project.clientLogoUrl} size="sm" />
          <div className="min-w-0">
            <p className="pcard-k">Client</p>
            <p className="truncate text-sm font-medium">{project.clientName}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
