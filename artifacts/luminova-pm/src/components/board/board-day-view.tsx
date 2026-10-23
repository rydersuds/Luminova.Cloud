import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react"
import type { BoardGroup, BoardItem, BoardItemStatus } from "@workspace/api-client-react"
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { DatesCell, StatusCell } from "./board-cells"
import { adjustTimelineSpan, boardDayTimelineRange, dayToDate, formatDay, groupTone, groupTextColor, isOverdue, itemSpan, parseDay, STATUS_TONE, timelineLabel, todayDay } from "./board-model"

const DAY_WIDTH = 44
const GROUP_ROW = 38
const ITEM_ROW = 76

type DayRow =
  | { kind: "group"; key: string; group: BoardGroup; top: number }
  | { kind: "item"; key: string; group: BoardGroup; item: BoardItem; top: number }
type Drag = { id: string; mode: "move" | "start" | "end"; originX: number; delta: number }

type Props = {
  groups: BoardGroup[]
  items: BoardItem[]
  undatedCount: number
  filtered: boolean
  onDatesChange: (id: string, dates: { startDate: string | null; endDate: string | null }) => void
  onStatusChange: (id: string, status: BoardItemStatus) => void
}

export function BoardDayView({ groups, items, undatedCount, filtered, onDatesChange, onStatusChange }: Props) {
  const [selectedDay, setSelectedDay] = useState(() => todayDay())
  const [drag, setDrag] = useState<Drag | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = todayDay()
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.position - b.position), [groups])
  const { rangeStart, days, rows } = useMemo(() => {
    const range = boardDayTimelineRange(items, today)
    const rows: DayRow[] = []
    let top = 0
    for (const group of sortedGroups) {
      rows.push({ kind: "group", key: `group-${group.id}`, group, top })
      top += GROUP_ROW
      for (const item of items.filter((entry) => entry.groupId === group.id).sort((a, b) => a.position - b.position)) {
        rows.push({ kind: "item", key: item.id, group, item, top })
        top += ITEM_ROW
      }
    }
    return { rangeStart: range.start, days: range.end - range.start + 1, rows }
  }, [items, sortedGroups, today])
  const width = days * DAY_WIDTH
  const height = rows.length ? rows[rows.length - 1].top + (rows[rows.length - 1].kind === "group" ? GROUP_ROW : ITEM_ROW) : 0
  const x = (day: number) => (day - rangeStart) * DAY_WIDTH
  const months = useMemo(() => {
    const result: Array<{ label: string; start: number; count: number }> = []
    for (let offset = 0; offset < days; offset += 1) {
      const day = rangeStart + offset
      const label = dayToDate(day).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
      const current = result[result.length - 1]
      if (current?.label === label) current.count += 1
      else result.push({ label, start: offset, count: 1 })
    }
    return result
  }, [days, rangeStart])
  const dateLabel = dayToDate(selectedDay).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const scrollToDay = (day: number, behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({
      left: Math.max(0, x(day) - element.clientWidth / 2 + DAY_WIDTH / 2),
      behavior,
    })
  }

  useEffect(() => {
    scrollToDay(today, "auto")
    // The initial scroll is intentionally anchored on today, even when the
    // selected date changes later via the date picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, width, today])

  const selectDay = (day: number) => {
    const bounded = Math.max(rangeStart, Math.min(rangeStart + days - 1, day))
    setSelectedDay(bounded)
    scrollToDay(bounded)
  }
  const spanFor = (item: BoardItem) => {
    const span = itemSpan(item)
    if (!span || drag?.id !== item.id) return span
    return adjustTimelineSpan(span, drag.mode, drag.delta)
  }
  const commit = (item: BoardItem, span: { start: number; end: number }) => {
    onDatesChange(item.id, { startDate: formatDay(span.start), endDate: formatDay(span.end) })
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, item: BoardItem, mode: Drag["mode"]) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ id: item.id, mode, originX: event.clientX, delta: 0 })
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return
    const delta = Math.round((event.clientX - drag.originX) / DAY_WIDTH)
    if (delta !== drag.delta) setDrag({ ...drag, delta })
  }
  const onPointerUp = (item: BoardItem) => {
    if (!drag) return
    const span = spanFor(item)
    const moved = drag.delta !== 0
    setDrag(null)
    if (span && moved) commit(item, span)
  }
  const onBarKeyDown = (event: KeyboardEvent<HTMLElement>, item: BoardItem) => {
    const span = itemSpan(item)
    if (!span) return
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (!step) return
    event.preventDefault()
    commit(item, adjustTimelineSpan(span, event.shiftKey ? "end" : "move", step))
  }

  return (
    <div className="space-y-3">
      <div className="board-day-controls">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="board-icon-btn" aria-label="Previous day" onClick={() => selectDay(selectedDay - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="board-icon-btn" aria-label="Next day" onClick={() => selectDay(selectedDay + 1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="truncate font-heading text-lg font-bold" aria-live="polite">{dateLabel}</h3>
            <p className="text-xs text-muted-foreground">Selected date in the day-by-day schedule</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="board-ghost-btn" onClick={() => selectDay(today)} disabled={selectedDay === today}>
            Today
          </button>
          <label className="board-day-date-picker">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Jump to date</span>
            <input
              type="date"
              value={formatDay(selectedDay)}
              onChange={(event) => {
                const day = parseDay(event.target.value)
                if (day !== null) selectDay(day)
              }}
              aria-label="Jump to date"
              className="board-day-date-input"
            />
          </label>
        </div>
      </div>

      <div className="board-day-timeline" aria-label="Project schedule by day">
        <div className="board-day-labels">
          <div className="board-day-label-header">Group / task</div>
          {rows.map((row) => row.kind === "group" ? (
            <div
              key={row.key}
              className="board-timeline-section board-day-group-label"
              style={{ height: GROUP_ROW, "--group": groupTone(row.group.color) } as React.CSSProperties}
            >
              <span className="truncate">{row.group.name}</span>
            </div>
          ) : (
            <div key={row.key} className="board-day-item-label" style={{ height: ITEM_ROW }}>
              <span className="truncate text-sm font-semibold" title={row.item.name}>{row.item.name}</span>
              <span className="board-day-item-detail truncate text-muted-foreground" title={`${row.item.assignee ?? "Unassigned"}${row.item.priority ? ` · ${row.item.priority} priority` : ""}`}>
                {row.item.assignee ?? "Unassigned"}{row.item.priority && <> · {row.item.priority} priority</>}
              </span>
              <div className="board-day-item-controls">
                <DatesCell item={row.item} onChange={(dates) => onDatesChange(row.item.id, dates)} />
                <StatusCell status={row.item.status} onChange={(status) => onStatusChange(row.item.id, status)} />
              </div>
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="board-day-scroll"
          role="region"
          aria-label="Day-by-day timeline. Scroll horizontally to browse dates."
          tabIndex={0}
        >
          <div className="board-day-canvas" style={{ width, height }}>
            <div className="board-day-date-header" style={{ width }}>
              <div className="board-day-month-row">
                {months.map((month) => (
                  <span key={`${month.label}-${month.start}`} className="board-day-month" style={{ left: month.start * DAY_WIDTH, width: month.count * DAY_WIDTH }}>
                    {month.label}
                  </span>
                ))}
              </div>
              <div className="board-day-date-row">
                {Array.from({ length: days }, (_, offset) => {
                  const day = rangeStart + offset
                  const date = dayToDate(day)
                  const isToday = day === today
                  const weekday = date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })
                  return (
                    <div key={day} data-date={formatDay(day)} className={cn("board-day-date", isToday && "board-day-date-today")} style={{ left: offset * DAY_WIDTH, width: DAY_WIDTH }} aria-label={dateLabelFor(day)} title={dateLabelFor(day)}>
                      <span>{weekday}</span>
                      <strong>{date.getUTCDate()}</strong>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="board-day-grid" style={{ height, backgroundSize: `${DAY_WIDTH}px 100%` }}>
              {today >= rangeStart && today < rangeStart + days && (
                <div className="board-timeline-today board-day-today-marker" style={{ left: x(today) + DAY_WIDTH / 2 }} aria-hidden="true">
                  <span>Today</span>
                </div>
              )}
              {rows.map((row) => row.kind === "group" ? (
                <div key={row.key} className="board-day-grid-group" style={{ top: row.top, height: GROUP_ROW, "--group": groupTone(row.group.color) } as React.CSSProperties} />
              ) : (
                <div key={row.key}>
                  <div className="board-day-grid-row" style={{ top: row.top, height: ITEM_ROW }} />
                  {(() => {
                    const span = spanFor(row.item)
                    if (!span) {
                      return (
                        <button
                          type="button"
                          className="board-timeline-set board-day-set-dates"
                          style={{ top: row.top + 22, left: x(selectedDay) }}
                          onClick={() => commit(row.item, { start: selectedDay, end: selectedDay + 4 })}
                        >
                          Add dates
                        </button>
                      )
                    }
                    const overdue = isOverdue(row.item, today)
                    const groupColor = row.item.color ?? row.group.color
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${row.item.name}, ${row.item.status}, ${timelineLabel({ startDate: formatDay(span.start), endDate: formatDay(span.end) })}`}
                        aria-roledescription="draggable timeline bar"
                        className={cn("board-bar", "board-bar-editable", drag?.id === row.item.id && "board-bar-dragging", overdue && "board-bar-overdue", row.item.status === "Done" && "board-bar-done")}
                        style={{
                          top: row.top + 22,
                          left: x(span.start),
                          width: Math.max(DAY_WIDTH, (span.end - span.start + 1) * DAY_WIDTH),
                          background: `hsl(${groupTone(groupColor)})`,
                          color: groupTextColor(groupColor),
                        } as React.CSSProperties}
                        title={`${row.item.name}: ${timelineLabel({ startDate: formatDay(span.start), endDate: formatDay(span.end) })}${overdue ? " (overdue)" : ""}`}
                        onPointerDown={(event) => onPointerDown(event, row.item, "move")}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => onPointerUp(row.item)}
                        onPointerCancel={() => setDrag(null)}
                        onKeyDown={(event) => onBarKeyDown(event, row.item)}
                      >
                        <span className="board-bar-handle board-bar-handle-start" aria-hidden="true" onPointerDown={(event) => onPointerDown(event, row.item, "start")} />
                        <span className="truncate pl-1.5 pr-2">
                          <span className="board-status-dot" style={{ background: `hsl(${STATUS_TONE[row.item.status]})` }} aria-hidden="true" />
                          {row.item.name}
                        </span>
                        <span className="board-bar-handle board-bar-handle-end" aria-hidden="true" onPointerDown={(event) => onPointerDown(event, row.item, "end")} />
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {undatedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {undatedCount} {undatedCount === 1 ? "task has" : "tasks have"} no dates. Use “Add dates” or the date editor in the task label.
          {filtered && " Board filters are active."}
        </p>
      )}
    </div>
  )
}

function dateLabelFor(day: number) {
  return dayToDate(day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
