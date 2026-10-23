import type { InvoiceBudgetCategory, InvoiceProject } from "@workspace/api-client-react"

export type ScopeOption = { key: string; label: string }

/** Distinct suites / shared areas that have categories, in server order. */
export function scopesOf(project?: InvoiceProject): ScopeOption[] {
  const seen = new Map<string, string>()
  for (const c of project?.categories ?? []) {
    if (!c.unitId && c.scopeKind !== "shared") continue
    const key = scopeKeyOf(c)
    if (!seen.has(key)) {
      const type = c.unitTypeName ? ` (${c.unitTypeName})` : ""
      seen.set(key, c.scopeKind === "shared" ? `Shared: ${c.unitLabel ?? "Shared area"}` : `Suite ${c.unitLabel ?? ""}${type}`)
    }
  }
  return [...seen].map(([key, label]) => ({ key, label }))
}

export function scopeKeyOf(c: InvoiceBudgetCategory) {
  return `${c.scopeKind === "shared" ? "shared" : "suite"}:${c.unitId}`
}

export const isUnitProject = (p?: InvoiceProject) => Boolean(p?.unitBudgetEnabled)
