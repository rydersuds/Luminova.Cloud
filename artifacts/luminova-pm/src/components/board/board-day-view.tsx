import { useMemo, useState } from "react"
import type { BoardGroup, BoardItem, BoardItemStatus } from "@workspace/api-client-react"
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react"
import { DatesCell, StatusCell } from "./board-cells"
import { dayToDate, formatDay, groupTone, initials, itemSpan, itemsForDay, parseDay, personColor, todayDay } from "./board-model"

type Props = {
  groups: BoardGroup[]
  items: BoardItem[]
  undatedCount: number
  filtered: boolean
  onDatesChange: (id: string, dates: { startDate: string | null; endDate: string | null }) => void
  onStatusChange: (id: string, status: BoardItemStatus) => void
}

export function BoardDayView({
  groups,
  items,
  undatedCount,
  filtered,
  onDatesChange,
  onStatusChange,
}: Props) {
  const [day, setDay] = useState(() => todayDay())
  const today = todayDay()
  const scheduled = useMemo(() => itemsForDay(items, day), [items, day])
  const visibleGroups = useMemo(() => [...groups]
    .sort((a, b) => a.position - b.position)
    .map((group) => ({
      ...group,
      items: scheduled
        .filter((item) => item.groupId === group.id)
        .sort((a, b) => a.position - b.position),
    }))
    .filter((group) => group.items.length > 0), [groups, scheduled])
  const dateLabel = dayToDate(day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  return (
    <div className="space-y-3">
      <div className="board-day-controls">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="board-icon-btn"
            aria-label="Previous day"
            onClick={() => setDay((current) => current - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="board-icon-btn"
            aria-label="Next day"
            onClick={() => setDay((current) => current + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="truncate font-heading text-lg font-bold" aria-live="polite">{dateLabel}</h3>
            <p className="text-xs text-muted-foreground">
              {scheduled.length} {scheduled.length === 1 ? "task" : "tasks"} scheduled
              {day === today && <span className="ml-2 font-semibold text-primary">Today</span>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="board-ghost-btn"
            onClick={() => setDay(today)}
            disabled={day === today}
          >
            Today
          </button>
          <label className="board-day-date-picker">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Choose day</span>
            <input
              type="date"
              value={formatDay(day)}
              onChange={(event) => {
                const selected = parseDay(event.target.value)
                if (selected !== null) setDay(selected)
              }}
              aria-label="Choose day"
              className="board-day-date-input"
            />
          </label>
        </div>
      </div>

      {visibleGroups.length > 0 ? (
        <div className="board-day-list" aria-label={`Tasks scheduled for ${dateLabel}`}>
          {visibleGroups.map((group) => (
            <section
              key={group.id}
              className="board-day-group"
              aria-label={`${group.name}: ${group.items.length} ${group.items.length === 1 ? "task" : "tasks"}`}
              style={{ "--group": groupTone(group.color) } as React.CSSProperties}
            >
              <header className="board-day-group-header">
                <span className="board-day-group-mark" aria-hidden="true" />
                <h4 className="truncate font-heading text-sm font-bold">{group.name}</h4>
                <span className="ml-auto board-count">{group.items.length}</span>
              </header>
              {group.items.map((item) => {
                const span = itemSpan(item)
                const timing = span?.start === day && span?.end === day
                  ? "One-day task"
                  : span?.start === day
                    ? "Starts today"
                    : span?.end === day
                      ? "Due today"
                      : "In progress today"
                return (
                  <article key={item.id} className="board-day-row">
                    <div className="board-day-task">
                      <span
                        className="board-status-dot board-day-status-dot"
                        style={{ background: `hsl(${groupTone(group.color)})` }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span>{timing}</span>
                          <span aria-hidden="true"> · </span>
                          {item.assignee ? (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="board-owner board-day-owner"
                                style={{ background: `hsl(${groupTone(personColor(item.assignee))})` }}
                                aria-hidden="true"
                              >
                                {initials(item.assignee)}
                              </span>
                              {item.assignee}
                            </span>
                          ) : "Unassigned"}
                          {item.priority && <><span aria-hidden="true"> · </span>{item.priority} priority</>}
                        </p>
                      </div>
                    </div>
                    <div className="board-day-dates">
                      <DatesCell item={item} onChange={(dates) => onDatesChange(item.id, dates)} />
                    </div>
                    <div className="board-day-status">
                      <StatusCell status={item.status} onChange={(status) => onStatusChange(item.id, status)} />
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      ) : (
        <div className="board-day-empty">
          <CalendarClock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">No tasks scheduled for this day</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered ? "Try another day or adjust the board filters." : "Use the arrows or date picker to check another day."}
          </p>
        </div>
      )}

      {undatedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {undatedCount} {undatedCount === 1 ? "task has" : "tasks have"} no dates and won’t appear in the day view. Set dates in Table view.
        </p>
      )}
    </div>
  )
}
