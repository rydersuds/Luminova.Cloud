import { useMemo, useState, type DragEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Link } from "wouter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { GROUP_TONE, STATUS_TONE, dayToDate, formatDay, groupTextColor, isOverdue, itemSpan, timelineLabel, todayDay } from "./board-model"
import { StatusLegend, type TimelineEntry } from "./board-timeline"
import type { BoardGroupColor } from "@workspace/api-client-react"

export type CalendarEntry = TimelineEntry & { color: BoardGroupColor }

type Segment = { entry: CalendarEntry; from: number; to: number; lane: number; startsHere: boolean; endsHere: boolean }

const DRAG_TYPE = "application/x-luminova-calendar-item"
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const LANES = 3

/** Splits each entry into one bar per week and stacks overlapping bars into lanes. */
function layoutWeek(entries: CalendarEntry[], weekStart: number): Segment[] {
  const weekEnd = weekStart + 6
  const segments = entries
    .map((entry) => ({ entry, span: itemSpan(entry)! }))
    .filter(({ span }) => span && span.start <= weekEnd && span.end >= weekStart)
    .sort((a, b) => a.span.start - b.span.start || (b.span.end - b.span.start) - (a.span.end - a.span.start))
  const laneEnds: number[] = []
  return segments.map(({ entry, span }) => {
    const from = Math.max(span.start, weekStart)
    const to = Math.min(span.end, weekEnd)
    let lane = laneEnds.findIndex((end) => end < from)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = to
    return { entry, from, to, lane, startsHere: span.start >= weekStart, endsHere: span.end <= weekEnd }
  })
}

export function BoardCalendar({
  entries,
  onDatesChange,
  undatedCount,
}: {
  entries: CalendarEntry[]
  onDatesChange?: (id: string, dates: { startDate: string; endDate: string }) => void
  undatedCount: number
}) {
  const today = todayDay()
  const [month, setMonth] = useState(() => {
    const now = dayToDate(today)
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
  })
  const [dropDay, setDropDay] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const editable = Boolean(onDatesChange)

  const { weeks, label } = useMemo(() => {
    const firstOfMonth = Date.UTC(month.year, month.month, 1) / 86_400_000
    const gridStart = firstOfMonth - dayToDate(firstOfMonth).getUTCDay()
    const lastOfMonth = Date.UTC(month.year, month.month + 1, 0) / 86_400_000
    const count = Math.ceil((lastOfMonth - gridStart + 1) / 7)
    return {
      weeks: Array.from({ length: count }, (_, index) => gridStart + index * 7),
      label: dayToDate(firstOfMonth).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
    }
  }, [month])

  const dated = useMemo(() => entries.filter((entry) => itemSpan(entry)), [entries])

  const shift = (offset: number) => setMonth((current) => {
    const date = new Date(Date.UTC(current.year, current.month + offset, 1))
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
  })

  const onDrop = (event: DragEvent, targetDay: number) => {
    event.preventDefault()
    setDropDay(null)
    setDragging(false)
    const raw = event.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    const { id, grabbed } = JSON.parse(raw) as { id: string; grabbed: number }
    const entry = entries.find((candidate) => candidate.id === id)
    const span = entry && itemSpan(entry)
    if (!span || grabbed === targetDay) return
    const delta = targetDay - grabbed
    onDatesChange?.(id, { startDate: formatDay(span.start + delta), endDate: formatDay(span.end + delta) })
  }

  const title = (entry: CalendarEntry) =>
    `${entry.name}${entry.detail ? ` · ${entry.detail}` : ""} · ${entry.status} · ${timelineLabel(entry)}${isOverdue(entry, today) ? " (overdue)" : ""}`

  const bar = (segment: Segment, inPopover = false) => {
    const { entry } = segment
    const placement = inPopover ? undefined : {
      gridColumn: `${(segment.from - weekStartOf(segment.from)) + 1} / span ${segment.to - segment.from + 1}`,
      gridRow: segment.lane + 1,
    }
    const className = cn("board-chip", !segment.startsHere && "board-chip-continues", !segment.endsHere && "board-chip-carries", entry.status === "Done" && "board-chip-done")
    const shared = {
      className,
      title: editable && !entry.href ? `${title(entry)}. Drag to another day to move it.` : title(entry),
      style: {
        background: `hsl(${GROUP_TONE[entry.color]})`,
        color: groupTextColor(entry.color),
        ...placement,
      } as React.CSSProperties,
    }
    const label = (
      <span className="truncate">
        <span className="board-status-dot" style={{ background: `hsl(${STATUS_TONE[entry.status]})` }} aria-hidden="true" />
        {entry.name}
      </span>
    )
    if (entry.href) return <Link key={`${entry.id}-${segment.from}`} href={entry.href} {...shared}>{label}</Link>
    return (
      <span
        key={`${entry.id}-${segment.from}`}
        {...shared}
        className={cn(shared.className, editable && "cursor-grab")}
        draggable={editable}
        onDragStart={(event) => {
          // Work out which day of the bar was grabbed so the drop keeps that day under the pointer.
          const rect = event.currentTarget.getBoundingClientRect()
          const days = segment.to - segment.from + 1
          const grabbed = segment.from + Math.min(days - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * days)))
          event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: entry.id, grabbed }))
          event.dataTransfer.effectAllowed = "move"
          window.setTimeout(() => setDragging(true))
        }}
        onDragEnd={() => {
          setDragging(false)
          setDropDay(null)
        }}
      >
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="board-icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
          <h3 className="min-w-[10rem] text-center font-heading text-lg font-bold" aria-live="polite">{label}</h3>
          <button type="button" className="board-icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
          <button type="button" className="board-ghost-btn" onClick={() => {
            const now = dayToDate(today)
            setMonth({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
          }}>Today</button>
        </div>
        <p className="text-sm text-muted-foreground">
          {editable ? "Drag an item to another day to move it." : "Select an item to open its project."}
          {undatedCount > 0 && ` ${undatedCount} ${undatedCount === 1 ? "item has" : "items have"} no dates yet.`}
          <StatusLegend />
        </p>
      </div>

      <div className="board-scroll">
        <div className={cn("board-calendar", dragging && "board-calendar-dragging")} aria-label={label}>
          <div className="board-calendar-weekdays">
            {WEEKDAYS.map((weekday) => <div key={weekday} className="board-calendar-weekday">{weekday}</div>)}
          </div>
          {weeks.map((weekStart) => {
            const segments = layoutWeek(dated, weekStart)
            const visible = segments.filter((segment) => segment.lane < LANES)
            return (
              <div key={weekStart} className="board-calendar-week">
                {Array.from({ length: 7 }, (_, column) => {
                  const day = weekStart + column
                  const date = dayToDate(day)
                  const hidden = segments.filter((segment) => segment.lane >= LANES && segment.from <= day && segment.to >= day)
                  const all = segments.filter((segment) => segment.from <= day && segment.to >= day)
                  return (
                    <div
                      key={day}
                      aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}, ${all.length} ${all.length === 1 ? "item" : "items"}`}
                      className={cn(
                        "board-calendar-day",
                        date.getUTCMonth() !== month.month && "board-calendar-outside",
                        day === today && "board-calendar-today",
                        dropDay === day && "board-calendar-drop",
                      )}
                      style={{ gridColumn: column + 1 }}
                      onDragOver={(event) => {
                        if (!editable || !event.dataTransfer.types.includes(DRAG_TYPE)) return
                        event.preventDefault()
                        setDropDay(day)
                      }}
                      onDrop={(event) => onDrop(event, day)}
                    >
                      <span className="board-calendar-date">{date.getUTCDate()}</span>
                      {hidden.length > 0 && (
                        <Popover>
                          <PopoverTrigger className="board-more">+{hidden.length} more</PopoverTrigger>
                          <PopoverContent className="w-64 space-y-1.5 p-2">
                            {all.map((segment) => bar(segment, true))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  )
                })}
                <div className="board-calendar-lanes">{visible.map((segment) => bar(segment))}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function weekStartOf(day: number) {
  return day - dayToDate(day).getUTCDay()
}
