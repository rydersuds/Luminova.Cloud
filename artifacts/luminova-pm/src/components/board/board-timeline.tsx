import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import type { BoardGroupColor, BoardItemStatus } from "@workspace/api-client-react"
import { Link } from "wouter"
import { cn } from "@/lib/utils"
import { GROUP_TONE, STATUS_TONE, dayToDate, formatDay, groupTone, groupTextColor, isOverdue, itemSpan, shortDate, timelineLabel, todayDay } from "./board-model"

export type TimelineEntry = {
  id: string
  name: string
  status: BoardItemStatus
  startDate: string | null
  endDate: string | null
  dependsOnId: string | null
  color?: BoardGroupColor | null
  /** Shown under the name, e.g. the project on the portfolio timeline. */
  detail?: string
  href?: string
}

/** Bars take their section's colour (a board group, or a project on the schedule); a dot shows status. */
export type TimelineSection = { id: string; title: string; color: BoardGroupColor; entries: TimelineEntry[]; href?: string }

type Drag = { id: string; mode: "move" | "start" | "end"; originX: number; delta: number }

const ROW = 40
const ZOOMS = { weeks: 30, months: 9 } as const

export function BoardTimeline({
  sections,
  onDatesChange,
  emptyMessage,
}: {
  sections: TimelineSection[]
  onDatesChange?: (id: string, dates: { startDate: string; endDate: string }) => void
  emptyMessage: string
}) {
  const [zoom, setZoom] = useState<keyof typeof ZOOMS>("weeks")
  const [drag, setDrag] = useState<Drag | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dayWidth = ZOOMS[zoom]
  const today = todayDay()
  const editable = Boolean(onDatesChange)

  const { rangeStart, days, rows } = useMemo(() => {
    const spans = sections.flatMap((section) => section.entries.map(itemSpan)).filter((span): span is NonNullable<typeof span> => span !== null)
    const first = Math.min(today, ...spans.map((span) => span.start)) - 7
    const last = Math.max(today + 42, ...spans.map((span) => span.end)) + 14
    // Start on a Sunday so week ticks line up.
    const start = first - dayToDate(first).getUTCDay()
    const flat: Array<{ kind: "section"; section: TimelineSection } | { kind: "entry"; entry: TimelineEntry; section: TimelineSection }> = []
    for (const section of sections) {
      flat.push({ kind: "section", section })
      for (const entry of section.entries) flat.push({ kind: "entry", entry, section })
    }
    return { rangeStart: start, days: last - start + 1, rows: flat }
  }, [sections, today])

  const spanFor = (entry: TimelineEntry) => {
    const span = itemSpan(entry)
    if (!span) return null
    if (!drag || drag.id !== entry.id) return span
    if (drag.mode === "move") return { start: span.start + drag.delta, end: span.end + drag.delta }
    if (drag.mode === "start") return { start: Math.min(span.start + drag.delta, span.end), end: span.end }
    return { start: span.start, end: Math.max(span.end + drag.delta, span.start) }
  }

  const rowTop = new Map<string, number>()
  rows.forEach((row, index) => {
    if (row.kind === "entry") rowTop.set(row.entry.id, index * ROW)
  })
  const entriesById = new Map(rows.flatMap((row) => (row.kind === "entry" ? [[row.entry.id, row.entry] as const] : [])))
  const x = (day: number) => (day - rangeStart) * dayWidth

  const commit = (entry: TimelineEntry, span: { start: number; end: number }) => {
    onDatesChange?.(entry.id, { startDate: formatDay(span.start), endDate: formatDay(span.end) })
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>, entry: TimelineEntry, mode: Drag["mode"]) => {
    if (!editable || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ id: entry.id, mode, originX: event.clientX, delta: 0 })
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return
    const delta = Math.round((event.clientX - drag.originX) / dayWidth)
    if (delta !== drag.delta) setDrag({ ...drag, delta })
  }
  const onPointerUp = (entry: TimelineEntry) => {
    if (!drag) return
    const span = spanFor(entry)
    const moved = drag.delta !== 0
    setDrag(null)
    if (span && moved) commit(entry, span)
  }
  const onBarKey = (event: KeyboardEvent<HTMLElement>, entry: TimelineEntry) => {
    const span = itemSpan(entry)
    if (!editable || !span) return
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (!step) return
    event.preventDefault()
    if (event.shiftKey) commit(entry, { start: span.start, end: Math.max(span.start, span.end + step) })
    else commit(entry, { start: span.start + step, end: span.end + step })
  }

  const months = useMemo(() => {
    const list: Array<{ label: string; from: number; to: number }> = []
    for (let day = rangeStart; day < rangeStart + days; day += 1) {
      const date = dayToDate(day)
      const label = date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
      const current = list[list.length - 1]
      if (current && current.label === label) current.to = day
      else list.push({ label, from: day, to: day })
    }
    return list
  }, [rangeStart, days])

  // Open on the current fortnight rather than the start of the project.
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: Math.max(0, (today - 10 - rangeStart) * dayWidth) })
  }, [zoom, rangeStart, today, dayWidth])

  const hasDated = rows.some((row) => row.kind === "entry" && itemSpan(row.entry))
  const width = days * dayWidth
  const height = rows.length * ROW

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {editable ? "Drag a bar to move it, or drag its ends to change dates. Arrow keys move a focused bar; Shift+arrow changes its length." : "Each bar is one dated item. Open a project to change its dates."}
          <StatusLegend />
        </p>
        <div className="hud-segment" role="group" aria-label="Timeline zoom">
          <button type="button" aria-pressed={zoom === "weeks"} onClick={() => setZoom("weeks")}>Weeks</button>
          <button type="button" aria-pressed={zoom === "months"} onClick={() => setZoom("months")}>Months</button>
          <button type="button" onClick={() => scrollRef.current?.scrollTo({ left: Math.max(0, x(today) - 240), behavior: "smooth" })}>Today</button>
        </div>
      </div>

      {!hasDated && <p className="board-empty">{emptyMessage}</p>}

      <div className="board-timeline">
        <div className="board-timeline-labels" style={{ paddingTop: 52 }}>
          {rows.map((row) => row.kind === "section" ? (
            <div key={`s-${row.section.id}`} className="board-timeline-section" style={{ height: ROW, "--group": groupTone(row.section.color) } as React.CSSProperties}>
              {row.section.href ? <Link href={row.section.href} className="truncate hover:text-primary">{row.section.title}</Link> : <span className="truncate">{row.section.title}</span>}
            </div>
          ) : (
            <div key={row.entry.id} className="board-timeline-label" style={{ height: ROW }}>
              <span className="truncate font-medium">{row.entry.href ? <Link href={row.entry.href} className="hover:text-primary">{row.entry.name}</Link> : row.entry.name}</span>
              {row.entry.detail && <span className="truncate text-[11px] text-muted-foreground">{row.entry.detail}</span>}
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="board-timeline-scroll">
          <div style={{ width, position: "relative" }}>
            <div className="board-timeline-header" style={{ width }}>
              <div className="relative h-6">
                {months.map((month) => (
                  <span key={month.label} className="board-timeline-month" style={{ left: x(month.from), width: (month.to - month.from + 1) * dayWidth }}>{month.label}</span>
                ))}
              </div>
              <div className="relative h-7">
                {Array.from({ length: Math.ceil(days / 7) }, (_, week) => rangeStart + week * 7).map((day) => (
                  <span key={day} className="board-timeline-week" style={{ left: x(day), width: 7 * dayWidth }}>{zoom === "weeks" ? shortDate(day) : ""}</span>
                ))}
              </div>
            </div>

            <div className="board-timeline-body" style={{ height, backgroundSize: `${7 * dayWidth}px ${ROW}px`, backgroundPosition: `0 0` }}>
              {today >= rangeStart && today < rangeStart + days && (
                <div className="board-timeline-today" style={{ left: x(today) + dayWidth / 2 }} aria-hidden="true"><span>Today</span></div>
              )}

              <svg className="board-timeline-links" width={width} height={height} aria-hidden="true">
                {rows.map((row) => {
                  if (row.kind !== "entry" || !row.entry.dependsOnId) return null
                  const before = entriesById.get(row.entry.dependsOnId)
                  const fromSpan = before && spanFor(before)
                  const toSpan = spanFor(row.entry)
                  const fromTop = before ? rowTop.get(before.id) : undefined
                  const toTop = rowTop.get(row.entry.id)
                  if (!fromSpan || !toSpan || fromTop === undefined || toTop === undefined) return null
                  const x1 = x(fromSpan.end + 1)
                  const y1 = fromTop + ROW / 2
                  const x2 = x(toSpan.start)
                  const y2 = toTop + ROW / 2
                  const conflict = toSpan.start <= fromSpan.end
                  const bend = x1 + 10
                  return (
                    <path
                      key={`${before!.id}-${row.entry.id}`}
                      d={`M${x1},${y1} H${bend} V${y2} H${x2 - 2}`}
                      className={cn("board-link", conflict && "board-link-conflict")}
                      markerEnd="url(#board-arrow)"
                    />
                  )
                })}
                <defs>
                  <marker id="board-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" className="board-link-head" />
                  </marker>
                </defs>
              </svg>

              {rows.map((row, index) => {
                if (row.kind !== "entry") return null
                const entry = row.entry
                const span = spanFor(entry)
                const top = index * ROW
                if (!span) {
                  return editable ? (
                    <button
                      key={entry.id}
                      type="button"
                      className="board-timeline-set"
                      style={{ top: top + 8, left: x(today) }}
                      onClick={() => commit(entry, { start: today, end: today + 4 })}
                    >
                      Add dates for {entry.name}
                    </button>
                  ) : null
                }
                const overdue = isOverdue(entry, today)
                return (
                  <div
                    key={entry.id}
                    role={editable ? "button" : "img"}
                    tabIndex={editable ? 0 : -1}
                    aria-label={`${entry.name}, ${entry.status}, ${timelineLabel({ startDate: formatDay(span.start), endDate: formatDay(span.end) })}`}
                    aria-roledescription={editable ? "draggable timeline bar" : undefined}
                    className={cn("board-bar", editable && "board-bar-editable", drag?.id === entry.id && "board-bar-dragging", overdue && "board-bar-overdue", entry.status === "Done" && "board-bar-done")}
                    style={{
                      top: top + 7,
                      left: x(span.start),
                      width: Math.max(dayWidth, (span.end - span.start + 1) * dayWidth),
                      background: `hsl(${groupTone(entry.color ?? row.section.color)})`,
                      color: groupTextColor(entry.color ?? row.section.color),
                    } as React.CSSProperties}
                    title={`${entry.name}: ${timelineLabel({ startDate: formatDay(span.start), endDate: formatDay(span.end) })}${overdue ? " (overdue)" : ""}`}
                    onPointerDown={(event) => onPointerDown(event, entry, "move")}
                    onPointerMove={onPointerMove}
                    onPointerUp={() => onPointerUp(entry)}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(event) => onBarKey(event, entry)}
                  >
                    {editable && <span className="board-bar-handle board-bar-handle-start" onPointerDown={(event) => onPointerDown(event, entry, "start")} />}
                    <span className="truncate pl-1.5 pr-2">
                      <span className="board-status-dot" style={{ background: `hsl(${STATUS_TONE[entry.status]})` }} aria-hidden="true" />
                      {entry.name}
                    </span>
                    {editable && <span className="board-bar-handle board-bar-handle-end" onPointerDown={(event) => onPointerDown(event, entry, "end")} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Explains the colour coding: bar colour is the group or project, the dot is the status. */
export function StatusLegend() {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span>Bar colour shows the group. Dot shows status:</span>
      {(Object.keys(STATUS_TONE) as BoardItemStatus[]).map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className="board-status-dot" style={{ background: `hsl(${STATUS_TONE[status]})` }} aria-hidden="true" />{status}
        </span>
      ))}
    </span>
  )
}
