import type { InvoiceBudgetCategory, InvoiceProject } from "@workspace/api-client-react"

// Match the server's source-category identity, not a suite-scoped purchase ID.
const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")

export function tradeUnitBreakdown(project: InvoiceProject) {
  const units = project.units ?? []
  const groups = new Map<string, { key: string; label: string; categories: InvoiceBudgetCategory[] }>()
  const shared: InvoiceBudgetCategory[] = []
  const aggregate: InvoiceBudgetCategory[] = []
  for (const category of project.categories) {
    if (category.scopeKind === "shared") {
      shared.push(category)
    } else if (category.unitId && units.some(unit => unit.id === category.unitId)) {
      const key = normalized(category.code || category.description)
      const group = groups.get(key) ?? { key, label: category.description, categories: [] }
      group.categories.push(category)
      groups.set(key, group)
    } else {
      // Never turn aggregate or unmatched scopes into suite allowances.
      aggregate.push(category)
    }
  }
  return {
    registeredCount: units.length,
    sourceCount: (project.unitTypes ?? []).reduce((sum, type) => sum + type.unitCount, 0),
    shared,
    aggregate,
    trades: [...groups.values()].map(group => {
      const rows = units.map(unit => ({
        unit,
        typeName: project.unitTypes?.find(type => type.id === unit.unitTypeId)?.name,
        // Keep the original object (and purchase ID); missing/ambiguous allocations stay unknown.
        category: group.categories.filter(category => category.unitId === unit.id).length === 1
          ? group.categories.find(category => category.unitId === unit.id)
          : undefined,
      }))
      const known = rows.every(row => typeof row.category?.budgeted === "number" && Number.isFinite(row.category.budgeted))
      return {
        key: group.key,
        label: group.label,
        rows,
        registeredBudget: known
          ? rows.reduce((sum, row) => sum + Math.round(row.category!.budgeted! * 100), 0) / 100
          : null,
      }
    }),
  }
}
