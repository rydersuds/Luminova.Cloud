import type { ReactNode } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover"

export function FilterMenu({ children, activeCount, onClear }: {
  children: ReactNode
  activeCount: number
  onClear: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="shrink-0 gap-2" aria-label="Filters" data-testid="button-filters">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground" aria-label={`${activeCount} active filters`}>{activeCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Filters" className="w-80 max-w-[calc(100vw-2rem)] max-h-[min(80dvh,var(--radix-popover-content-available-height))] overflow-y-auto">
        <h2 className="mb-4 font-semibold">Filters</h2>
        <div className="space-y-3 [&_select]:w-full">{children}</div>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" size="sm" disabled={activeCount === 0} onClick={onClear}>Clear filters</Button>
          <PopoverClose asChild><Button type="button" size="sm">Done</Button></PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>
}
