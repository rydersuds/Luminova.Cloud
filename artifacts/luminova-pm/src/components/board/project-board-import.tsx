import { useMemo, useState } from "react"
import {
  previewBoardImport,
  type BoardGroup,
  type BoardGroupColor,
  type BoardImportPreview,
  type BoardImportPreviewRow,
  type BoardItemPriority,
  type BoardItemStatus,
} from "@workspace/api-client-react"
import { FileUp, LoaderCircle, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GROUP_COLORS } from "./board-model"
import type { BoardActions } from "./use-board"

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const STATUS_OPTIONS: BoardItemStatus[] = ["Not started", "Working on it", "Stuck", "Done"]
const PRIORITY_OPTIONS: BoardItemPriority[] = ["Low", "Medium", "High", "Critical"]

type EditableRow = BoardImportPreviewRow & { localId: number; acknowledged: string[] }
type GroupMapping = { targetRef: string; name: string; color: BoardGroupColor }
type Props = { projectId: string; groups: BoardGroup[]; actions: BoardActions }

const sourceKey = (group: string | null) => group ?? "__unassigned__"
const sourceLabel = (group: string | null) => group ?? "No group detected"
const costText = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2)

function errorMessage(error: unknown) {
  const data = (error as { data?: { error?: unknown } } | null)?.data
  return typeof data?.error === "string" ? data.error : "The file could not be read. Try a different file."
}

function currentIssues(row: EditableRow): string[] {
  return row.issues.filter((issue) => {
    if (row.acknowledged.includes(issue)) return false
    if (issue.startsWith("Task name is required") && row.name.trim()) return false
    if (issue.startsWith("Task name is over") && row.name.trim().length <= 200) return false
    if (issue.startsWith("Owner is over") && (row.assignee?.length ?? 0) <= 120) return false
    if (issue.startsWith("Unknown status") && row.status) return false
    if (issue.startsWith("Unknown priority") && row.priority) return false
    if ((issue.startsWith("Start date") && row.startDate) || (issue.startsWith("End date") && row.endDate)) return false
    if (issue.startsWith("Cost needs review") && row.costCents !== null) return false
    if (issue.startsWith("Cost is outside") && row.costCents !== null) return false
    return true
  })
}

function validateRow(row: EditableRow, mapping: GroupMapping | undefined) {
  const issues = currentIssues(row)
  if (!row.name.trim()) issues.push("Task name is required.")
  if (row.name.trim().length > 200) issues.push("Task name must be 200 characters or fewer.")
  if ((row.assignee?.length ?? 0) > 120) issues.push("Owner must be 120 characters or fewer.")
  if (row.startDate && row.endDate && row.endDate < row.startDate) issues.push("End date can't be before start date.")
  if (row.costCents !== null && (!Number.isSafeInteger(row.costCents) || row.costCents > 2_147_483_647)) {
    issues.push("Cost is outside the supported range.")
  }
  if (!mapping?.targetRef) issues.push("Choose an existing group or create a new one.")
  else if (mapping.targetRef.startsWith("new:") && !mapping.name.trim()) issues.push("Name the new group before importing.")
  return [...new Set(issues)]
}

export function ProjectBoardImport({ projectId, groups, actions }: Props) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BoardImportPreview | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [mappings, setMappings] = useState<Record<string, GroupMapping>>({})
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const groupNames = useMemo(() => [
    ...new Set((preview?.rows ?? []).map((row) => sourceKey(row.sourceGroup))),
  ], [preview])
  const validation = useMemo(() => new Map(rows.map((row) => {
    const mapping = mappings[sourceKey(row.sourceGroup)]
    return [row.localId, validateRow(row, mapping)]
  })), [rows, mappings])
  const invalidRows = rows.filter((row) => (validation.get(row.localId)?.length ?? 0) > 0).length

  const reset = () => {
    setFile(null)
    setPreview(null)
    setRows([])
    setMappings({})
    setError("")
    setLoading(false)
    setSaving(false)
  }

  const close = (next: boolean) => {
    if (!next && (loading || saving)) return
    setOpen(next)
    if (!next) reset()
  }

  const receiveFile = async (selected: File | undefined) => {
    if (!selected) return
    setFile(selected)
    setPreview(null)
    setRows([])
    setMappings({})
    setError("")
    const extension = selected.name.toLowerCase().split(".").pop()
    if (!["csv", "xlsx", "pdf", "jpg", "jpeg", "png"].includes(extension ?? "")) {
      setError("Choose a CSV, XLSX, PDF, JPEG, or PNG file.")
      return
    }
    if (selected.size === 0) {
      setError("The selected file is empty.")
      return
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setError("Files must be 8 MiB or smaller.")
      return
    }
    setLoading(true)
    try {
      const result = await previewBoardImport(projectId, selected, {
        headers: { "X-File-Name": selected.name },
      })
      setPreview(result)
      setRows(result.rows.map((row, index) => ({ ...row, localId: index, acknowledged: [] })))
      const sourceGroups = [...new Set(result.rows.map((row) => sourceKey(row.sourceGroup)))]
      const initialMappings: Record<string, GroupMapping> = {}
      sourceGroups.forEach((key, index) => {
        const sourceName = result.rows.find((row) => sourceKey(row.sourceGroup) === key)?.sourceGroup ?? ""
        const matching = groups.find((group) => group.name.trim().toLowerCase() === sourceName.trim().toLowerCase())
        const fallbackGroup = groups[0]
        if (matching) {
          initialMappings[key] = { targetRef: matching.id, name: "", color: "gold" }
        } else if (sourceName.trim()) {
          initialMappings[key] = {
            targetRef: `new:import-${index}`,
            name: sourceName.slice(0, 80),
            color: GROUP_COLORS[(groups.length + index) % GROUP_COLORS.length],
          }
        } else if (fallbackGroup) {
          initialMappings[key] = { targetRef: fallbackGroup.id, name: "", color: "gold" }
        }
      })
      setMappings(initialMappings)
    } catch (uploadError) {
      setError(errorMessage(uploadError))
    } finally {
      setLoading(false)
    }
  }

  const updateRow = (localId: number, update: Partial<EditableRow>) => {
    setRows((current) => current.map((row) => row.localId === localId
      ? { ...row, ...update, acknowledged: update.acknowledged ?? row.acknowledged }
      : row))
  }

  const changeMapping = (key: string, targetRef: string) => {
    setMappings((current) => {
      const previous = current[key]
      if (targetRef === "__create__") {
        const freshKey = `import-${Object.keys(current).length}-${Date.now().toString(36)}`
        const sourceName = key === "__unassigned__" ? "" : key
        return {
          ...current,
          [key]: {
            targetRef: `new:${freshKey}`,
            name: sourceName.slice(0, 80),
            color: previous?.color ?? GROUP_COLORS[(groups.length + Object.keys(current).length) % GROUP_COLORS.length],
          },
        }
      }
      return { ...current, [key]: { ...previous, targetRef, name: "", color: previous?.color ?? "gold" } }
    })
  }

  const confirmImport = async () => {
    if (!rows.length || invalidRows || saving) return
    const groupsToCreate = Object.values(mappings)
      .filter((mapping) => mapping.targetRef.startsWith("new:"))
      .map((mapping) => ({
        key: mapping.targetRef.slice(4),
        name: mapping.name.trim(),
        color: mapping.color,
      }))
    setSaving(true)
    setError("")
    const result = await actions.importItems({
      groupsToCreate,
      items: rows.map((row) => ({
        groupRef: mappings[sourceKey(row.sourceGroup)].targetRef.startsWith("new:")
          ? mappings[sourceKey(row.sourceGroup)].targetRef.slice(4)
          : mappings[sourceKey(row.sourceGroup)].targetRef,
        name: row.name.trim(),
        ...(row.status ? { status: row.status } : {}),
        priority: row.priority,
        assignee: row.assignee?.trim() || null,
        startDate: row.startDate,
        endDate: row.endDate,
        costCents: row.costCents,
      })),
    })
    setSaving(false)
    if (result) close(false)
  }

  return (
    <>
      <button
        type="button"
        className="board-ghost-btn inline-flex items-center gap-1.5"
        onClick={() => setOpen(true)}
        data-testid="button-import-board-file"
      >
        <FileUp className="h-4 w-4" aria-hidden="true" />
        Import file
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="flex max-h-[92dvh] w-[min(96vw,76rem)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
            <DialogTitle>Import schedule rows</DialogTitle>
            <DialogDescription>
              Upload a schedule PDF and AI fills in the tasks, groups, owners, and dates automatically. Review the results, then import them. CSV, Excel, JPEG, and PNG also work.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-4 hover:bg-muted/40">
              <FileUp className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{file?.name ?? "Choose a schedule file"}</span>
                <span className="block text-xs text-muted-foreground">CSV, XLSX, PDF, JPEG, or PNG · up to 8 MiB · PDFs up to 20 pages</span>
              </span>
              <span className="board-solid-btn">Browse files</span>
              <input
                type="file"
                disabled={loading || saving}
                accept=".csv,.xlsx,.pdf,.jpg,.jpeg,.png"
                className="sr-only"
                aria-label="Choose a board import file"
                data-testid="input-board-import-file"
                onChange={(event) => {
                  void receiveFile(event.target.files?.[0])
                  event.currentTarget.value = ""
                }}
              />
            </label>
            {loading && <p className="flex items-center gap-2 text-sm" role="status" data-testid="status-board-import-loading"><LoaderCircle className="h-4 w-4 animate-spin" />{/\.(pdf|jpe?g|png)$/i.test(file?.name ?? "") ? "AI is reading the schedule and filling in tasks and dates…" : "Reading file and preparing preview…"}</p>}
            {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="alert-board-import">{error}</p>}
            {preview && (
              <div className="space-y-4" data-testid="panel-board-import-preview">
                {/\.(pdf|jpe?g|png)$/i.test(file?.name ?? "") && <p className="text-sm text-muted-foreground">AI has filled in the detected fields. Check the dates before importing; unclear or missing values are left blank.</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold" data-testid="text-board-import-count">
                    {rows.length} {rows.length === 1 ? "row" : "rows"} detected
                  </p>
                  {invalidRows > 0 && <p className="text-sm text-destructive" role="status">{invalidRows} {invalidRows === 1 ? "row needs" : "rows need"} review or removal.</p>}
                  {invalidRows === 0 && rows.length > 0 && <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">All remaining rows are ready to import.</p>}
                </div>
                <section aria-labelledby="board-import-group-heading" className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h3 id="board-import-group-heading" className="text-sm font-semibold">Map detected groups</h3>
                    <p className="text-xs text-muted-foreground">Choose an existing board group or create a new group for each detected section.</p>
                  </div>
                  {groupNames.map((key) => {
                    const mapping = mappings[key]
                    const isNew = mapping?.targetRef.startsWith("new:")
                    return (
                      <div key={key} className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(13rem,1.5fr)] sm:items-center">
                        <span className="truncate text-sm" title={sourceLabel(key === "__unassigned__" ? null : key)}>{sourceLabel(key === "__unassigned__" ? null : key)}</span>
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <select
                            aria-label={`Map ${sourceLabel(key === "__unassigned__" ? null : key)} to board group`}
                            data-testid={`select-board-import-group-${key}`}
                            value={isNew ? "__create__" : mapping?.targetRef ?? ""}
                            onChange={(event) => changeMapping(key, event.target.value)}
                            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {!mapping && <option value="">Choose a board group</option>}
                            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                            <option value="__create__">Create a new group…</option>
                          </select>
                          {isNew && (
                            <>
                              <input
                                value={mapping.name}
                                onChange={(event) => setMappings((current) => ({
                                  ...current,
                                  [key]: { ...current[key], name: event.target.value },
                                }))}
                                maxLength={80}
                                aria-label={`New group name for ${sourceLabel(key === "__unassigned__" ? null : key)}`}
                                data-testid={`input-board-import-new-group-${key}`}
                                placeholder="New group name"
                                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                              />
                              <select
                                value={mapping.color}
                                aria-label={`New group color for ${sourceLabel(key === "__unassigned__" ? null : key)}`}
                                onChange={(event) => setMappings((current) => ({
                                  ...current,
                                  [key]: { ...current[key], color: event.target.value as BoardGroupColor },
                                }))}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                              >
                                {GROUP_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
                              </select>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </section>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <caption className="sr-only">Review, edit, assign, or remove detected schedule rows before import</caption>
                    <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2">Source row</th><th className="p-2">Task</th><th className="p-2">Owner</th>
                        <th className="p-2">Status</th><th className="p-2">Priority</th><th className="p-2">Start</th>
                        <th className="p-2">End</th><th className="p-2">Cost</th><th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const issues = validation.get(row.localId) ?? []
                        const costValue = costText(row.costCents)
                        return (
                          <tr key={row.localId} className="border-t align-top" data-testid={`row-board-import-${row.localId}`}>
                            <td className="whitespace-nowrap p-2 text-muted-foreground">#{row.rowNumber}<span className="sr-only">, {sourceLabel(row.sourceGroup)}</span></td>
                            <td className="min-w-48 p-2">
                              <input value={row.name} maxLength={500} aria-label={`Task name for row ${row.rowNumber}`} data-testid={`input-board-import-name-${row.localId}`} onChange={(event) => updateRow(row.localId, { name: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2" />
                              {issues.length > 0 && (
                                <ul className="mt-1 space-y-1 text-xs text-destructive">
                                  {issues.map((issue) => (
                                    <li key={issue} className="flex items-start justify-between gap-2">
                                      <span>{issue}</span>
                                      {row.issues.includes(issue) && (
                                        <button type="button" className="shrink-0 underline" data-testid={`button-acknowledge-import-issue-${row.localId}`} onClick={() => updateRow(row.localId, { acknowledged: [...row.acknowledged, issue] })}>Leave blank</button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="p-2"><input value={row.assignee ?? ""} maxLength={200} aria-label={`Owner for row ${row.rowNumber}`} data-testid={`input-board-import-owner-${row.localId}`} onChange={(event) => updateRow(row.localId, { assignee: event.target.value || null })} className="h-9 w-28 rounded-md border border-input bg-background px-2" /></td>
                            <td className="p-2"><select value={row.status ?? ""} aria-label={`Status for row ${row.rowNumber}`} data-testid={`select-board-import-status-${row.localId}`} onChange={(event) => updateRow(row.localId, { status: (event.target.value || null) as BoardItemStatus | null })} className="h-9 rounded-md border border-input bg-background px-2"><option value="">Leave unset</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
                            <td className="p-2"><select value={row.priority ?? ""} aria-label={`Priority for row ${row.rowNumber}`} data-testid={`select-board-import-priority-${row.localId}`} onChange={(event) => updateRow(row.localId, { priority: (event.target.value || null) as BoardItemPriority | null })} className="h-9 rounded-md border border-input bg-background px-2"><option value="">Leave unset</option>{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></td>
                            <td className="p-2"><input type="date" value={row.startDate ?? ""} aria-label={`Start date for row ${row.rowNumber}`} data-testid={`input-board-import-start-${row.localId}`} onChange={(event) => updateRow(row.localId, { startDate: event.target.value || null })} className="h-9 w-36 rounded-md border border-input bg-background px-2" /></td>
                            <td className="p-2"><input type="date" value={row.endDate ?? ""} aria-label={`End date for row ${row.rowNumber}`} data-testid={`input-board-import-end-${row.localId}`} onChange={(event) => updateRow(row.localId, { endDate: event.target.value || null })} className="h-9 w-36 rounded-md border border-input bg-background px-2" /></td>
                            <td className="p-2"><input type="number" min="0" step="0.01" inputMode="decimal" value={costValue} aria-label={`Cost in dollars for row ${row.rowNumber}`} data-testid={`input-board-import-cost-${row.localId}`} onChange={(event) => {
                              const text = event.target.value
                              const amount = text === "" ? null : Number(text)
                              updateRow(row.localId, { costCents: amount === null || !Number.isFinite(amount) ? null : Math.round(amount * 100) })
                            }} className="h-9 w-28 rounded-md border border-input bg-background px-2" /></td>
                            <td className="p-2"><button type="button" onClick={() => setRows((current) => current.filter((entry) => entry.localId !== row.localId))} aria-label={`Remove row ${row.rowNumber}`} data-testid={`button-remove-board-import-row-${row.localId}`} className="board-icon-btn text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No rows remain. Choose another file or close this review.</p>}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t px-5 py-3">
            <button type="button" className="board-ghost-btn" onClick={() => close(false)} disabled={loading || saving} data-testid="button-cancel-board-import">Cancel</button>
            {preview && (
              <button
                type="button"
                className="board-solid-btn inline-flex items-center gap-2"
                disabled={saving || loading || rows.length === 0 || invalidRows > 0}
                onClick={() => void confirmImport()}
                data-testid="button-confirm-board-import"
              >
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Add {rows.length} {rows.length === 1 ? "row" : "rows"} to board
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
