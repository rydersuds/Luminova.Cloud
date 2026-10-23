import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetInvoiceProjectsQueryKey, getGetProjectQueryKey, useUpdateProjectBudgetUnits, type InvoiceProject, type ProjectBudgetUnit } from "@workspace/api-client-react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function SuiteRegister({ project }: { project: InvoiceProject }) {
  const qc = useQueryClient()
  const save = useUpdateProjectBudgetUnits()
  const types = project.unitTypes ?? []
  const [open, setOpen] = useState(false)
  const [units, setUnits] = useState<ProjectBudgetUnit[]>([])
  const [error, setError] = useState<string | null>(null)

  const begin = () => { setUnits((project.units ?? []).map((u) => ({ ...u }))); setError(null); setOpen(true) }
  const assigned = (id: string) => units.filter((u) => u.unitTypeId === id).length
  const add = (typeId: string) => setUnits((l) => [...l, { id: crypto.randomUUID(), label: "", unitTypeId: typeId }])
  const patch = (id: string, label: string) => setUnits((l) => l.map((u) => (u.id === id ? { ...u, label } : u)))
  const remove = (id: string) => setUnits((l) => l.filter((u) => u.id !== id))
  const labels = units.map((u) => u.label.trim().toLowerCase())
  const blank = units.some((u) => !u.label.trim())
  const dup = new Set(labels).size !== labels.length
  const over = types.some((t) => assigned(t.id) > t.unitCount)

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({ projectId: project.id, data: { units: units.map((u) => ({ ...u, label: u.label.trim() })) } })
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetInvoiceProjectsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) }),
      ])
      setOpen(false)
    } catch (e) {
      const d = e as { data?: { error?: string }; message?: string }
      setError(d?.data?.error || d?.message || "Suite register couldn't be saved.")
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="panel-suite-register">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Suite register</p>
          <p className="text-xs text-muted-foreground">Only registered suites get trade budgets. Enter your own suite numbers.</p>
        </div>
        {!open && <Button type="button" variant="outline" size="sm" onClick={begin} data-testid="button-edit-suites">Edit suites</Button>}
      </div>
      <ul className="grid gap-1 text-xs tabular-nums sm:grid-cols-2">
        {types.map((t) => {
          const n = (project.units ?? []).filter((u) => u.unitTypeId === t.id).length
          return <li key={t.id} className="flex min-w-0 flex-wrap justify-between gap-2 rounded border px-2 py-1"><span className="min-w-0 break-words">{t.name}: {n} of {t.unitCount} assigned</span><span className="min-w-0 break-words text-muted-foreground">${t.perUnitTotal.toLocaleString()} per unit · ${t.total.toLocaleString()}</span></li>
        })}
      </ul>
      {open && (
        <div className="space-y-4">
          {types.map((t) => (
            <div key={t.id} className="space-y-2">
              <p className="text-xs font-semibold">{t.name} <span className="font-normal text-muted-foreground">{assigned(t.id)} of {t.unitCount} assigned</span></p>
              {units.filter((u) => u.unitTypeId === t.id).map((u) => (
                <div key={u.id} className="flex gap-2">
                  <Input data-testid={`input-suite-label-${u.id}`} aria-label={`Suite label, ${t.name}`} maxLength={80} value={u.label} onChange={(e) => patch(u.id, e.target.value)} placeholder="Suite label" />
                  <Button type="button" variant="outline" size="icon" aria-label="Remove suite" data-testid={`button-remove-suite-${u.id}`} onClick={() => remove(u.id)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" data-testid={`button-add-suite-${t.id}`} disabled={assigned(t.id) >= t.unitCount} onClick={() => add(t.id)}><Plus className="mr-1 h-3.5 w-3.5" />Add {t.name} suite</Button>
            </div>
          ))}
          {(blank || dup || over) && <p className="text-xs text-warning">{blank ? "Every suite needs a label. " : ""}{dup ? "Labels must be unique. " : ""}{over ? "A type has more suites than its source count." : ""}</p>}
          {error && <p role="alert" className="text-xs text-destructive" data-testid="text-suite-error">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" disabled={save.isPending || blank || dup || over} onClick={() => void submit()} data-testid="button-save-suites">{save.isPending ? "Saving…" : "Save suites"}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
