import { useState } from "react"
import { useExtractDocumentedUnits, type InvoiceProject, type ProjectBudgetUnit } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"

const labelKey = (label: string) => label.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")

export function DocumentUnitReview({ project, units, onAdd }: {
  project: InvoiceProject
  units: ProjectBudgetUnit[]
  onAdd: (units: ProjectBudgetUnit[]) => void
}) {
  const extract = useExtractDocumentedUnits()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [types, setTypes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const registered = new Set(units.map(unit => labelKey(unit.label)))
  const candidates = extract.data?.candidates ?? []
  const chosen = candidates.filter(candidate => selected[candidate.label] && !registered.has(labelKey(candidate.label)))
  const unresolved = chosen.some(candidate => !(types[candidate.label] ?? candidate.unitTypeId))
  const over = (project.unitTypes ?? []).some(type =>
    units.filter(unit => unit.unitTypeId === type.id).length +
    chosen.filter(candidate => (types[candidate.label] ?? candidate.unitTypeId) === type.id).length > type.unitCount)
  const discover = async () => {
    setError(null); setAdded(0)
    try {
      await extract.mutateAsync({ projectId: project.id })
      setSelected({}); setTypes({})
    } catch (e) {
      const details = e as { data?: { error?: string }; message?: string }
      setError(details.data?.error || details.message || "Stored documents couldn't be reviewed. Saved suites have not changed.")
    }
  }
  const add = () => {
    onAdd(chosen.map(candidate => ({
      id: crypto.randomUUID(), label: candidate.label, unitTypeId: (types[candidate.label] ?? candidate.unitTypeId)!,
    })))
    setAdded(chosen.length); setSelected({})
  }
  return <section className="space-y-3 rounded-md border p-3" aria-label="Documented unit review">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold">Find suite numbers in stored rebuild documents</p>
      <Button type="button" size="sm" variant="outline" disabled={extract.isPending} onClick={() => void discover()} data-testid="button-find-document-units">
        {extract.isPending ? "Reviewing documents…" : "Find documented units"}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">Review only. This will not change saved suites, your manual edits, or financial totals.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {extract.data && <div className="space-y-3" data-testid="document-unit-results">
      <p className="text-xs font-semibold">{candidates.length} documented labels found · not a verified complete list</p>
      <details className="text-xs">
        <summary className="cursor-pointer">Sources and review limits</summary>
        <ul className="mt-2 space-y-2">
          {extract.data.sources.map(source => <li key={source.documentId} className="break-words">
            {source.sourcePath} — {source.status}; {source.pagesRead} of {source.pageCount || "unknown"} pages
          </li>)}
          {extract.data.warnings.map(warning => <li key={warning} className="text-muted-foreground">{warning}</li>)}
        </ul>
      </details>
      {!candidates.length && <p role="status" className="text-xs text-muted-foreground">No explicit project suite labels could be verified. Check the sources and limits above; saved suites are unchanged.</p>}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {candidates.map(candidate => {
          const exists = registered.has(labelKey(candidate.label))
          return <div key={candidate.label} className="space-y-2 rounded border p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={exists} checked={!exists && !!selected[candidate.label]}
                  onChange={event => setSelected(value => ({ ...value, [candidate.label]: event.target.checked }))}
                  aria-label={`Select suite ${candidate.label}`} />
                <span className="font-semibold">{candidate.label}</span>
              </label>
              {exists ? <span className="text-muted-foreground">Already in this register — existing ID retained</span> : <select
                aria-label={`Dwelling type for suite ${candidate.label}`}
                value={types[candidate.label] ?? candidate.unitTypeId ?? ""}
                onChange={event => setTypes(value => ({ ...value, [candidate.label]: event.target.value }))}
                className="h-8 max-w-full rounded border bg-background px-2">
                <option value="">Unassigned — choose dwelling type</option>
                {(project.unitTypes ?? []).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>}
              {candidate.uncertain && <span className="text-warning">Uncertain / revision review required</span>}
              {!candidate.unitTypeId && <span className="text-muted-foreground">No document-supported type match</span>}
            </div>
            <details>
              <summary className="cursor-pointer">Source evidence ({candidate.evidence.length})</summary>
              {candidate.evidence.map((evidence, index) => <blockquote key={index} className="mt-2 break-words border-l-2 pl-2 text-muted-foreground">
                <p>{evidence.sourcePath} · page {evidence.page}{evidence.method === "ocr" ? " · OCR — verify visually" : ""}</p>
                <p className="mt-1 whitespace-pre-wrap">{evidence.text}</p>
              </blockquote>)}
            </details>
          </div>
        })}
      </div>
      {unresolved && <p className="text-xs text-warning">Choose a dwelling type for each selected label before adding. No allowances are guessed.</p>}
      {over && <p className="text-xs text-warning">Selected suites exceed a dwelling type's source count. Review the labels and mappings.</p>}
      {!!candidates.length && <Button type="button" size="sm" variant="outline" onClick={add}
        disabled={!chosen.length || unresolved || over} data-testid="button-add-documented-units">Add {chosen.length} selected to draft</Button>}
      {!!added && <p role="status" className="text-xs text-muted-foreground">{added} labels added to your draft. Use Save suites below to confirm.</p>}
    </div>}
  </section>
}
