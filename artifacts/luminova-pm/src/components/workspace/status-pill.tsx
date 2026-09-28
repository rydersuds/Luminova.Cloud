import { cn } from "@/lib/utils"

const TONE: Record<string, string> = {
  Active: "live",
  "In progress": "live",
  Planning: "plan",
  "Pre-construction": "plan",
  "On hold": "hold",
  Completed: "done",
  "Rejected for bid": "stop",
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span data-tone={TONE[status] ?? "plan"} className={cn("status-pill", className)}>
      <span aria-hidden="true" className="status-pill-dot" />
      {status}
    </span>
  )
}
