import { useMemo, useState } from "react"
import { getGetBoardScheduleQueryKey, useGetBoardSchedule, useGetCurrentWorkspaceUser } from "@workspace/api-client-react"
import { CalendarDays, GanttChartSquare } from "lucide-react"
import { Link } from "wouter"
import { BoardCalendar, type CalendarEntry } from "@/components/board/board-calendar"
import { GROUP_COLORS, GROUP_TONE, STATUS_TONE, isOverdue, itemSpan, statusTextColor, timelineLabel, todayDay } from "@/components/board/board-model"
import type { BoardGroupColor } from "@workspace/api-client-react"
import { BoardTimeline, type TimelineSection } from "@/components/board/board-timeline"
import { cn } from "@/lib/utils"

type View = "timeline" | "calendar"

export default function SchedulePage() {
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const isClient = currentUser?.role === "Client"
  const { data: items, isLoading, isError, refetch } = useGetBoardSchedule({ query: { enabled: currentUser !== undefined && !isClient, queryKey: getGetBoardScheduleQueryKey() } })
  const scheduleItems = Array.isArray(items) ? items : undefined
  const itemList = scheduleItems ?? []
  const invalidScheduleData = items !== undefined && scheduleItems === undefined
  const [view, setView] = useState<View>("timeline")
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const today = todayDay()

  const projects = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: BoardGroupColor; tone: string }>()
    for (const item of itemList) {
      if (!seen.has(item.projectId)) {
        const color = GROUP_COLORS[seen.size % GROUP_COLORS.length]
        seen.set(item.projectId, { id: item.projectId, name: item.projectName, color, tone: GROUP_TONE[color] })
      }
    }
    return [...seen.values()]
  }, [itemList])

  const projectTones = useMemo(() => new Map(projects.map((project) => [project.id, project.tone])), [projects])
  const visible = useMemo(() => itemList.filter((item) => !hidden.has(item.projectId)), [itemList, hidden])

  const sections: TimelineSection[] = useMemo(() => projects
    .filter((project) => !hidden.has(project.id))
    .map((project) => ({
      id: project.id,
      title: project.name,
      color: project.color,
      href: `/projects/${project.id}?tab=board`,
      entries: visible
        .filter((item) => item.projectId === project.id)
        .map((item) => ({ ...item, detail: item.groupName, href: `/projects/${project.id}?tab=board` })),
    })), [projects, visible, hidden])

  const calendarEntries: CalendarEntry[] = useMemo(() => sections.flatMap((section) =>
    section.entries.map((entry) => ({ ...entry, detail: section.title, color: entry.color ?? section.color }))), [sections])

  const overdue = visible.filter((item) => isOverdue(item, today))
  const thisWeek = visible.filter((item) => {
    const span = itemSpan(item)
    return span && item.status !== "Done" && span.start <= today + 6 && span.end >= today
  })

  if (isClient) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <p className="board-empty">The schedule is available to the project team. Open a project from the sidebar to see its details.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 md:p-8">
      <header className="hud-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-kicker">Portfolio schedule</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Schedule</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every dated board item across your projects. Open a project's board to change dates or status.</p>
        </div>
        <div className="hud-segment" role="group" aria-label="Schedule view">
          <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}><GanttChartSquare className="h-3.5 w-3.5" aria-hidden="true" />Timeline</button>
          <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Calendar</button>
        </div>
      </header>

      {isLoading && <div className="space-y-3" aria-busy="true" aria-label="Loading schedule">{[0, 1, 2].map((key) => <div key={key} className="skeleton-line h-14" />)}</div>}
      {(isError || invalidScheduleData) && (
        <p className="board-empty" role="alert">The schedule couldn't be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></p>
      )}

      {scheduleItems && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <WeekList title="Happening this week" empty="Nothing is scheduled for the next seven days." items={thisWeek} projectTones={projectTones} />
            <WeekList title="Overdue" empty="Nothing is overdue. Nice work." items={overdue} tone={STATUS_TONE.Stuck} projectTones={projectTones} />
          </div>

          {projects.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show projects">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</span>
              {projects.map((project) => {
                const shown = !hidden.has(project.id)
                return (
                  <button
                    key={project.id}
                    type="button"
                    aria-pressed={shown}
                    onClick={() => setHidden((current) => {
                      const next = new Set(current)
                      if (next.has(project.id)) next.delete(project.id)
                      else next.add(project.id)
                      return next
                    })}
                    className={cn("board-filter", shown && "board-filter-on")}
                    style={{ "--tone": project.tone } as React.CSSProperties}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${project.tone})` }} />{project.name}
                  </button>
                )
              })}
            </div>
          )}

          {scheduleItems.length === 0 ? (
            <p className="board-empty">No board items have dates yet. Add dates to items on a project's board and they'll appear here.</p>
          ) : view === "timeline" ? (
            <BoardTimeline sections={sections} emptyMessage="Every project is hidden. Turn one back on above." />
          ) : (
            <BoardCalendar entries={calendarEntries} undatedCount={0} />
          )}
        </>
      )}
    </div>
  )
}

function WeekList({ title, empty, items, tone, projectTones }: {
  title: string
  empty: string
  items: Array<{ id: string; name: string; projectId: string; projectName: string; status: keyof typeof STATUS_TONE; startDate: string | null; endDate: string | null }>
  tone?: string
  projectTones: Map<string, string>
}) {
  return (
    <section className="surface-3d p-4" aria-label={title}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold" style={tone && items.length ? { color: `hsl(${tone})` } : undefined}>{title}</h2>
        <span className="hud-index">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((item) => (
            <li key={item.id}>
              <Link href={`/projects/${item.projectId}?tab=board`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-primary/10">
                <span className="board-pill w-28 shrink-0 text-[11px]" style={{ background: `hsl(${STATUS_TONE[item.status]})`, color: statusTextColor(item.status), height: "1.6rem" }}>{item.status}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `hsl(${projectTones.get(item.projectId) ?? GROUP_TONE.gold})` }} aria-hidden="true" />
                    {item.projectName}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timelineLabel(item)}</span>
              </Link>
            </li>
          ))}
          {items.length > 6 && <li className="px-2 text-xs text-muted-foreground">and {items.length - 6} more on the timeline below</li>}
        </ul>
      )}
    </section>
  )
}
