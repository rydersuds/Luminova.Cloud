import { useMemo, useState } from "react"
import type { BoardItemStatus } from "@workspace/api-client-react"
import { CalendarDays, GanttChartSquare, Search, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BoardCalendar, type CalendarEntry } from "./board-calendar"
import { BOARD_STATUSES, STATUS_TONE, formatCents, isOverdue } from "./board-model"
import { BoardTable } from "./board-table"
import { BoardTimeline, type TimelineSection } from "./board-timeline"
import { ProjectBoardImport } from "./project-board-import"
import { useBoard } from "./use-board"

const VIEWS = [
  { id: "table", label: "Table", icon: Table2 },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
] as const
type View = (typeof VIEWS)[number]["id"]
const VIEW_KEY = "luminova-board-view"

function readView(): View {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    return VIEWS.some((view) => view.id === stored) ? stored as View : "table"
  } catch {
    return "table"
  }
}

export function ProjectBoard({ projectId }: { projectId: string }) {
  const board = useBoard(projectId)
  const [view, setView] = useState<View>(readView)
  const [search, setSearch] = useState("")
  const [statuses, setStatuses] = useState<Set<BoardItemStatus>>(new Set())

  const chooseView = (next: View) => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Remembering the view is a convenience only.
    }
  }

  const data = board.data
  const items = Array.isArray(data?.items) ? data.items : []
  const boardGroups = Array.isArray(data?.groups) ? data.groups : []
  const invalidBoardData = data !== undefined && (
    !Array.isArray(data?.items) || !Array.isArray(data?.groups)
  )
  const filtered = Boolean(search.trim()) || statuses.size > 0
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) =>
      (!statuses.size || statuses.has(item.status))
      && (!term || `${item.name} ${item.assignee ?? ""}`.toLowerCase().includes(term)))
  }, [items, search, statuses])

  const groups = useMemo(() => [...boardGroups].sort((a, b) => a.position - b.position), [boardGroups])
  const sections: TimelineSection[] = useMemo(() => groups.map((group) => ({
    id: group.id,
    title: group.name,
    color: group.color,
    entries: visibleItems.filter((item) => item.groupId === group.id).sort((a, b) => a.position - b.position),
  })), [groups, visibleItems])
  const calendarEntries: CalendarEntry[] = useMemo(() => sections.flatMap((section) =>
    section.entries.map((entry) => ({ ...entry, color: section.color }))), [sections])

  if (board.isLoading) {
    return <div className="space-y-3" aria-busy="true" aria-label="Loading board">{[0, 1, 2].map((key) => <div key={key} className="skeleton-line h-14" />)}</div>
  }
  if (board.isError || !data || invalidBoardData) {
    return (
      <div className="board-empty" role="alert">
        The board couldn't be loaded. <button type="button" className="underline" onClick={() => void board.refetch()}>Try again</button>
      </div>
    )
  }

  const done = items.filter((item) => item.status === "Done").length
  const stuck = items.filter((item) => item.status === "Stuck").length
  const overdue = items.filter((item) => isOverdue(item)).length
  const cost = items.reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  const onDatesChange = (id: string, dates: { startDate: string; endDate: string }) => void board.updateItem(id, dates)

  return (
    <section aria-label="Project board" className="space-y-5">
      <div className="board-stats">
        <Stat label="Items" value={String(items.length)} />
        <Stat label="Done" value={items.length ? `${Math.round((done / items.length) * 100)}%` : "—"} />
        <Stat label="Stuck" value={String(stuck)} tone={stuck ? STATUS_TONE.Stuck : undefined} />
        <Stat label="Overdue" value={String(overdue)} tone={overdue ? STATUS_TONE.Stuck : undefined} />
        <Stat label="Planned cost" value={cost ? formatCents(cost) : "—"} />
      </div>

      <div className="board-toolbar">
        <div className="hud-segment" role="group" aria-label="Board view">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => chooseView(id)}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        <label className="recessed-3d flex h-10 min-w-[12rem] flex-1 items-center gap-2 px-3 sm:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search items</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items or owners" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <ProjectBoardImport projectId={projectId} groups={groups} actions={board} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {BOARD_STATUSES.map((status) => {
            const active = statuses.has(status)
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => setStatuses((current) => {
                  const next = new Set(current)
                  if (next.has(status)) next.delete(status)
                  else next.add(status)
                  return next
                })}
                className={cn("board-filter", active && "board-filter-on")}
                style={{ "--tone": STATUS_TONE[status] } as React.CSSProperties}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${STATUS_TONE[status]})` }} />{status}
              </button>
            )
          })}
          {filtered && <button type="button" className="board-ghost-btn" onClick={() => { setSearch(""); setStatuses(new Set()) }}>Clear</button>}
        </div>
      </div>

      {view === "table" && <BoardTable board={data} visibleItems={visibleItems} actions={board} filtered={filtered} />}
      {view === "timeline" && (
        <BoardTimeline
          sections={sections}
          onDatesChange={onDatesChange}
          emptyMessage="No items have dates yet. Use “Add dates” on a row below, or set dates in the Table view."
        />
      )}
      {view === "calendar" && (
        <BoardCalendar entries={calendarEntries} onDatesChange={onDatesChange} undatedCount={visibleItems.filter((item) => !item.startDate && !item.endDate).length} />
      )}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="board-stat">
      <span className="hud-index uppercase">{label}</span>
      <span className="font-heading text-xl font-bold tabular-nums" style={tone ? { color: `hsl(${tone})` } : undefined}>{value}</span>
    </div>
  )
}
