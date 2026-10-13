import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import type { BoardItem, BoardItemPriority, BoardItemStatus } from "@workspace/api-client-react"
import { Check } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  BOARD_PRIORITIES,
  BOARD_STATUSES,
  PRIORITY_TONE,
  STATUS_TONE,
  formatCents,
  isOverdue,
  itemSpan,
  parseCostInput,
  statusTextColor,
  timelineLabel,
  todayDay,
} from "./board-model"

/** A cell that shows text and turns into an input on click. Enter or leaving the cell saves; Escape cancels. */
export function TextCell({
  value,
  placeholder,
  label,
  onSave,
  className,
  format = (text) => text,
  inputMode,
}: {
  value: string
  placeholder: string
  label: string
  onSave: (next: string) => void
  className?: string
  format?: (text: string) => string
  inputMode?: "text" | "decimal"
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== value.trim()) onSave(draft)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit()
    if (event.key === "Escape") {
      setDraft(value)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={label}
        value={draft}
        inputMode={inputMode}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={cn("board-input", className)}
      />
    )
  }
  return (
    <button
      type="button"
      aria-label={`${label}: ${value || "empty"}. Click to edit`}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={cn("board-text", !value && "board-placeholder", className)}
    >
      {value ? format(value) : placeholder}
    </button>
  )
}

export function StatusCell({ status, onChange }: { status: BoardItemStatus; onChange: (next: BoardItemStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Status: ${status}. Change status`}
        className="board-pill"
        style={{ background: `hsl(${STATUS_TONE[status]})`, color: statusTextColor(status) }}
      >
        {status}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-44 p-1.5">
        {BOARD_STATUSES.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => onChange(option)}
            className="mb-1 justify-center rounded-md font-semibold last:mb-0"
            style={{ background: `hsl(${STATUS_TONE[option]})`, color: statusTextColor(option) }}
          >
            {option === status && <Check className="mr-1 h-3.5 w-3.5" />}{option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PriorityCell({ priority, onChange }: { priority: BoardItemPriority | null; onChange: (next: BoardItemPriority | null) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Priority: ${priority ?? "none"}. Change priority`}
        className={cn("board-pill", !priority && "board-pill-empty")}
        style={priority ? { background: `hsl(${PRIORITY_TONE[priority]} / .22)`, color: `hsl(${PRIORITY_TONE[priority]})`, boxShadow: `inset 0 0 0 1px hsl(${PRIORITY_TONE[priority]} / .5)` } : undefined}
      >
        {priority ?? "Set priority"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-40 p-1.5">
        {BOARD_PRIORITIES.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)} className="gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${PRIORITY_TONE[option]})` }} />
            {option}
            {option === priority && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        {priority && <DropdownMenuItem onSelect={() => onChange(null)} className="text-muted-foreground">Clear priority</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Shows the item's dates with a bar for how far through them today is; opens a picker to change them. */
export function DatesCell({ item, onChange }: { item: BoardItem; onChange: (dates: { startDate: string | null; endDate: string | null }) => void }) {
  const [start, setStart] = useState(item.startDate ?? "")
  const [end, setEnd] = useState(item.endDate ?? "")
  const span = itemSpan(item)
  const today = todayDay()
  const elapsed = span ? Math.max(0, Math.min(1, (today - span.start + 1) / (span.end - span.start + 1))) : 0
  const overdue = isOverdue(item, today)
  const invalid = Boolean(start && end && end < start)

  return (
    <Popover onOpenChange={(open) => {
      if (open) {
        setStart(item.startDate ?? "")
        setEnd(item.endDate ?? "")
      }
    }}>
      <PopoverTrigger aria-label={`Dates: ${timelineLabel(item) || "not set"}. Change dates`} className={cn("board-dates", !span && "board-pill-empty")}>
        {span ? (
          <>
            <span className="board-dates-fill" style={{ width: `${(item.status === "Done" ? 1 : elapsed) * 100}%` }} data-overdue={overdue || undefined} />
            <span className="relative">{timelineLabel(item)}</span>
          </>
        ) : "Set dates"}
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="center">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Start
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="board-input w-full" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            End
            <input type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} className="board-input w-full" />
          </label>
        </div>
        {invalid && <p role="alert" className="text-xs text-destructive">The end date can't be before the start date.</p>}
        <div className="flex justify-between gap-2">
          <button type="button" className="board-ghost-btn" onClick={() => onChange({ startDate: null, endDate: null })}>Clear</button>
          <button
            type="button"
            disabled={invalid}
            className="board-solid-btn"
            onClick={() => onChange({ startDate: start || (end || null), endDate: end || (start || null) })}
          >
            Save dates
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function CostCell({ costCents, onChange }: { costCents: number | null; onChange: (next: number | null) => void }) {
  const [error, setError] = useState(false)
  return (
    <div className="relative">
      <TextCell
        label="Cost"
        value={costCents === null ? "" : String(costCents / 100)}
        placeholder="—"
        inputMode="decimal"
        format={() => formatCents(costCents)}
        className="text-right tabular-nums"
        onSave={(text) => {
          const cents = parseCostInput(text)
          if (cents === undefined) {
            setError(true)
            window.setTimeout(() => setError(false), 2500)
            return
          }
          onChange(cents)
        }}
      />
      {error && <span role="alert" className="board-cell-error">Enter an amount like 12500</span>}
    </div>
  )
}

export function DependsCell({ item, candidates, onChange }: { item: BoardItem; candidates: BoardItem[]; onChange: (next: string | null) => void }) {
  return (
    <select
      aria-label={`${item.name} depends on`}
      value={item.dependsOnId ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      className={cn("board-select", !item.dependsOnId && "board-placeholder")}
    >
      <option value="">No dependency</option>
      {candidates.filter((candidate) => candidate.id !== item.id).map((candidate) => (
        <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
      ))}
    </select>
  )
}
