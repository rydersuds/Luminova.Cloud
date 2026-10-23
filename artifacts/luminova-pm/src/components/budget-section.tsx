import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Native disclosure keeps forms mounted so closing a section never discards edits. */
export function BudgetSection({
  title, description, aside, children, className, ...props
}: {
  title: ReactNode
  description?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  "data-testid"?: string
}) {
  return (
    <details open className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...props}>
      <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 rounded-xl p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden [&>svg]:-rotate-90 [[open]>&>svg]:rotate-0">
        <ChevronDown aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 transition-transform" />
        <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:justify-between">
          <span className="min-w-0">
            <span role="heading" aria-level={3} className="block text-lg font-semibold leading-none tracking-tight">{title}</span>
            {description && <span className="mt-1.5 block text-sm text-muted-foreground">{description}</span>}
          </span>
          {aside && <span className="shrink-0">{aside}</span>}
        </span>
      </summary>
      {children}
    </details>
  )
}
