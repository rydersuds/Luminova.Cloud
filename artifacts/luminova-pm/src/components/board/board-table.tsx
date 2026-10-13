import { useState, type DragEvent } from "react"
import type { BoardGroup, BoardItem, ProjectBoard } from "@workspace/api-client-react"
import { ChevronDown, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { CostCell, DatesCell, DependsCell, PriorityCell, StatusCell, TextCell } from "./board-cells"
import { BOARD_STATUSES, GROUP_COLORS, GROUP_TONE, STATUS_TONE, formatCents, groupTextColor, initials, itemSpan, personColor, shortDate } from "./board-model"
import type { BoardActions } from "./use-board"

const DRAG_TYPE = "application/x-luminova-board-item"

type Props = {
  board: ProjectBoard
  visibleItems: BoardItem[]
  actions: BoardActions
  filtered: boolean
}

export function BoardTable({ board, visibleItems, actions, filtered }: Props) {
  const groups = [...board.groups].sort((a, b) => a.position - b.position)
  const allItems = [...board.items].sort((a, b) => a.position - b.position)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTarget, setDropTarget] = useState<{ groupId: string; index: number } | null>(null)
  const [newGroupName, setNewGroupName] = useState("")

  const toggle = (groupId: string) => setCollapsed((current) => {
    const next = new Set(current)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    return next
  })

  const onDrop = (event: DragEvent, groupId: string, index: number) => {
    event.preventDefault()
    const itemId = event.dataTransfer.getData(DRAG_TYPE)
    setDropTarget(null)
    const item = board.items.find((entry) => entry.id === itemId)
    if (!item) return
    // Dropping below its own row in the same group means one slot earlier once it's lifted out.
    const adjusted = item.groupId === groupId && item.position < index ? index - 1 : index
    if (item.groupId === groupId && item.position === adjusted) return
    void actions.updateItem(itemId, { groupId, position: adjusted })
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const groupItems = visibleItems.filter((item) => item.groupId === group.id).sort((a, b) => a.position - b.position)
        const isCollapsed = collapsed.has(group.id)
        return (
          <section key={group.id} aria-label={group.name} className="board-group" style={{ "--group": GROUP_TONE[group.color] } as React.CSSProperties}>
            <GroupHeader
              group={group}
              count={groupItems.length}
              collapsed={isCollapsed}
              onToggle={() => toggle(group.id)}
              actions={actions}
              canDelete={groups.length > 1}
            />
            {!isCollapsed && (
              <div className="board-scroll">
                <div role="table" aria-label={`${group.name} items`} className="board-grid">
                  <div role="row" className="board-row board-head">
                    <span role="columnheader" aria-label="Reorder" />
                    <span role="columnheader">Item</span>
                    <span role="columnheader">Owner</span>
                    <span role="columnheader" className="text-center">Status</span>
                    <span role="columnheader" className="text-center">Priority</span>
                    <span role="columnheader" className="text-center">Timeline</span>
                    <span role="columnheader" className="text-right">Cost</span>
                    <span role="columnheader">Depends on</span>
                    <span role="columnheader" aria-label="Actions" />
                  </div>
                  {groupItems.map((item, index) => (
                    <div
                      key={item.id}
                      role="row"
                      className={cn("board-row", dropTarget?.groupId === group.id && dropTarget.index === index && "board-drop-before")}
                      onDragOver={(event) => {
                        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
                        event.preventDefault()
                        const rect = event.currentTarget.getBoundingClientRect()
                        const after = event.clientY > rect.top + rect.height / 2
                        setDropTarget({ groupId: group.id, index: after ? index + 1 : index })
                      }}
                      onDrop={(event) => onDrop(event, group.id, dropTarget?.groupId === group.id ? dropTarget.index : index)}
                    >
                      <span role="cell" className="flex items-center justify-center">
                        <span
                          draggable={!filtered}
                          aria-hidden="true"
                          title={filtered ? "Clear filters to reorder" : "Drag to reorder or move to another group"}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(DRAG_TYPE, item.id)
                            event.dataTransfer.effectAllowed = "move"
                          }}
                          onDragEnd={() => setDropTarget(null)}
                          className={cn("board-grip", filtered && "opacity-30")}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                      </span>
                      <span role="cell" className="min-w-0">
                        <TextCell label="Item name" value={item.name} placeholder="Name this item" className="font-semibold" onSave={(name) => name.trim() && actions.updateItem(item.id, { name: name.trim() })} />
                      </span>
                      <span role="cell" className="flex min-w-0 items-center gap-1.5">
                        {item.assignee && <OwnerBadge name={item.assignee} />}
                        <TextCell label="Owner" value={item.assignee ?? ""} placeholder="Assign" onSave={(assignee) => actions.updateItem(item.id, { assignee: assignee.trim() || null })} />
                      </span>
                      <span role="cell"><StatusCell status={item.status} onChange={(status) => actions.updateItem(item.id, { status })} /></span>
                      <span role="cell"><PriorityCell priority={item.priority} onChange={(priority) => actions.updateItem(item.id, { priority })} /></span>
                      <span role="cell"><DatesCell item={item} onChange={(dates) => actions.updateItem(item.id, dates)} /></span>
                      <span role="cell"><CostCell costCents={item.costCents} onChange={(costCents) => actions.updateItem(item.id, { costCents })} /></span>
                      <span role="cell" className="min-w-0"><DependsCell item={item} candidates={allItems} onChange={(dependsOnId) => actions.updateItem(item.id, { dependsOnId })} /></span>
                      <span role="cell" className="flex justify-center">
                        <ItemMenu item={item} groups={groups} actions={actions} />
                      </span>
                    </div>
                  ))}
                  {!filtered && (
                    <div
                      className={cn("board-row board-add-row", dropTarget?.groupId === group.id && dropTarget.index === groupItems.length && "board-drop-before")}
                      onDragOver={(event) => {
                        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
                        event.preventDefault()
                        setDropTarget({ groupId: group.id, index: groupItems.length })
                      }}
                      onDrop={(event) => onDrop(event, group.id, groupItems.length)}
                    >
                      <span />
                      <AddItemInput groupName={group.name} onAdd={(name) => actions.addItem({ groupId: group.id, name })} />
                    </div>
                  )}
                  {groupItems.length > 0 && <GroupSummary items={groupItems} />}
                </div>
              </div>
            )}
          </section>
        )
      })}

      {!filtered && (
        <form
          className="board-new-group"
          onSubmit={async (event) => {
            event.preventDefault()
            const name = newGroupName.trim()
            if (!name) return
            const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
            if (await actions.addGroup({ name, color })) setNewGroupName("")
          }}
        >
          <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
          <label htmlFor="board-new-group" className="sr-only">New group name</label>
          <input
            id="board-new-group"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="Add a group, for example Landscaping"
            maxLength={80}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!newGroupName.trim()} className="board-solid-btn">Add group</button>
        </form>
      )}
    </div>
  )
}

function GroupHeader({ group, count, collapsed, onToggle, actions, canDelete }: {
  group: BoardGroup
  count: number
  collapsed: boolean
  onToggle: () => void
  actions: BoardActions
  canDelete: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <header className="board-group-head">
      <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`} className="board-icon-btn">
        <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
      </button>
      <TextCell label="Group name" value={group.name} placeholder="Name this group" className="board-group-name" onSave={(name) => name.trim() && actions.updateGroup(group.id, { name: name.trim() })} />
      <span className="board-count">{count} {count === 1 ? "item" : "items"}</span>
      <DropdownMenu onOpenChange={(open) => !open && setConfirming(false)}>
        <DropdownMenuTrigger aria-label={`${group.name} options`} className="board-icon-btn ml-auto">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Group colour</DropdownMenuLabel>
          <div className="flex flex-wrap gap-2 px-2 pb-2">
            {GROUP_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color}`}
                aria-pressed={group.color === color}
                onClick={() => actions.updateGroup(group.id, { color })}
                className="h-6 w-6 rounded-full ring-offset-2 ring-offset-popover aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ background: `hsl(${GROUP_TONE[color]})` }}
              />
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={group.position === 0} onSelect={() => actions.updateGroup(group.id, { position: group.position - 1 })}>Move group up</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.updateGroup(group.id, { position: group.position + 1 })}>Move group down</DropdownMenuItem>
          <DropdownMenuSeparator />
          {canDelete ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(event) => {
                if (!confirming) {
                  event.preventDefault()
                  setConfirming(true)
                  return
                }
                void actions.removeGroup(group.id)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {confirming ? `Delete group and its ${count} ${count === 1 ? "item" : "items"}` : "Delete group"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>A board needs at least one group</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

function ItemMenu({ item, groups, actions }: { item: BoardItem; groups: BoardGroup[]; actions: BoardActions }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <DropdownMenu onOpenChange={(open) => !open && setConfirming(false)}>
      <DropdownMenuTrigger aria-label={`${item.name} options`} className="board-icon-btn">
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Move to group</DropdownMenuLabel>
        {groups.filter((group) => group.id !== item.groupId).map((group) => (
          <DropdownMenuItem key={group.id} onSelect={() => actions.updateItem(item.id, { groupId: group.id })} className="gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${GROUP_TONE[group.color]})` }} />
            {group.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            if (!confirming) {
              event.preventDefault()
              setConfirming(true)
              return
            }
            void actions.removeItem(item.id)
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {confirming ? "Click again to delete" : "Delete item"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AddItemInput({ groupName, onAdd }: { groupName: string; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="col-span-8 flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || busy) return
        setBusy(true)
        const created = await onAdd(trimmed)
        setBusy(false)
        if (created) setName("")
      }}
    >
      <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <input
        aria-label={`Add item to ${groupName}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add item"
        maxLength={200}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      {name.trim() && <button type="submit" disabled={busy} className="board-solid-btn">Add</button>}
    </form>
  )
}

/** Monday-style footer: the status mix as a bar, the total cost, and the group's overall dates. */
function GroupSummary({ items }: { items: BoardItem[] }) {
  const total = items.reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  const spans = items.map(itemSpan).filter((span): span is NonNullable<typeof span> => span !== null)
  const start = spans.length ? Math.min(...spans.map((span) => span.start)) : null
  const end = spans.length ? Math.max(...spans.map((span) => span.end)) : null
  const done = items.filter((item) => item.status === "Done").length
  return (
    <div role="row" className="board-row board-summary">
      <span />
      <span className="text-xs text-muted-foreground">{done} of {items.length} done</span>
      <span />
      <span
        role="img"
        aria-label={BOARD_STATUSES.map((status) => `${items.filter((item) => item.status === status).length} ${status}`).join(", ")}
        className="board-battery"
      >
        {BOARD_STATUSES.map((status) => {
          const share = items.filter((item) => item.status === status).length / items.length
          return share ? <span key={status} style={{ flexGrow: share, background: `hsl(${STATUS_TONE[status]})` }} title={`${status}: ${Math.round(share * 100)}%`} /> : null
        })}
      </span>
      <span />
      <span className="text-center text-xs tabular-nums text-muted-foreground">{start !== null && end !== null ? `${shortDate(start)} – ${shortDate(end)}` : ""}</span>
      <span className="text-right text-xs font-semibold tabular-nums">{total ? formatCents(total) : ""}</span>
      <span />
      <span />
    </div>
  )
}

/** Initials in a colour fixed to the person or company, so owners are easy to spot down a column. */
function OwnerBadge({ name }: { name: string }) {
  const color = personColor(name)
  return (
    <span aria-hidden="true" className="board-owner" style={{ background: `hsl(${GROUP_TONE[color]})`, color: groupTextColor(color) }}>
      {initials(name)}
    </span>
  )
}
