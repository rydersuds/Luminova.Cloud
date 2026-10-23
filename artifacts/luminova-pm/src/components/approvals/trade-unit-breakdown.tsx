import type { InvoiceBudgetCategory, InvoiceProject } from "@workspace/api-client-react"
import { ChevronDown } from "lucide-react"
import { BudgetSection } from "@/components/budget-section"
import { tradeUnitBreakdown } from "@/lib/trade-unit-breakdown"
import { money } from "./approval-model"

function Amounts({ category }: { category?: InvoiceBudgetCategory }) {
  const known = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value)
  const verified = known(category?.remaining)
  return (
    <div className="min-w-0 space-y-1">
      <dl className="grid min-w-0 gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Budget</dt><dd className="break-words font-semibold tabular-nums">{known(category?.budgeted) ? money(category!.budgeted!) : "Unverified"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{verified ? "Used" : "Recorded used (partial)"}</dt><dd className="break-words tabular-nums">{known(category?.used) ? money(category!.used) : "Unknown"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Remaining</dt><dd className="break-words font-semibold tabular-nums">{verified ? money(category!.remaining!) : "Unverified"}</dd></div>
      </dl>
      {!verified && <p className="text-xs text-muted-foreground">{category ? "Recorded costs are not a verified total. Source limits may be unverified or historical costs may be unallocated; no costs have been divided between suites." : "No source trade allocation is available for this suite. No allowance has been inferred."}</p>}
    </div>
  )
}

export function TradeUnitBreakdown({ project }: { project: InvoiceProject }) {
  const data = tradeUnitBreakdown(project)
  return (
    <div className="min-w-0 space-y-4" data-testid="trade-unit-breakdown">
      <p className="text-sm text-muted-foreground">
        {data.registeredCount} registered suites of {data.sourceCount} source units.
        {" "}Subtotals below cover registered suites only, not the full project budget. Shared areas are separate.
        {data.registeredCount < data.sourceCount && " Registration is incomplete; unregistered source units are not represented."}
      </p>
      {!data.registeredCount && <p className="board-empty">No suites registered. Use Edit suites in the Suite register above to enter real suite labels and select their source dwelling types.</p>}
      {!!data.registeredCount && !data.trades.length && <p className="board-empty">No source trade allocations are available for the registered suites. No per-suite amounts have been inferred.</p>}
      <ul className="min-w-0 divide-y divide-border">
        {data.trades.map(trade => (
          <li key={trade.key} className="min-w-0">
            <details className="group min-w-0 py-2" data-testid="trade-unit-category">
              <summary className="flex min-h-12 min-w-0 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <span className="min-w-0">
                  <span className="block break-words font-semibold">{trade.label}</span>
                  <span className="block break-words text-xs text-muted-foreground">Registered-suite budget subtotal: {trade.registeredBudget === null ? "Unverified — incomplete source limits" : money(trade.registeredBudget)} · {trade.rows.length} suites</span>
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
              </summary>
              <ul className="space-y-3 px-2 pb-2 pt-3" aria-label={`${trade.label} registered suites`}>
                {trade.rows.map(({ unit, typeName, category }) => (
                  <li key={unit.id} className="grid min-w-0 gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" data-category-id={category?.id}>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">Suite {unit.label}</p>
                      <p className="break-words text-xs text-muted-foreground">{category?.unitTypeName ?? typeName ?? "Dwelling type unavailable"}</p>
                      {category && <p className="break-words text-xs text-muted-foreground">{category.description}</p>}
                    </div>
                    <Amounts category={category} />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      {!!data.shared.length && (
        <BudgetSection title="Shared-area budgets">
          <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">Separate source budgets, not suite allowances. Not divided across units or included in registered-suite subtotals.</p>
          {data.shared.map(category => <div key={category.id} className="min-w-0 space-y-2 rounded-lg border p-3"><p className="break-words text-sm font-semibold">{category.unitLabel ?? category.description}</p><Amounts category={category} /></div>)}
          </div>
        </BudgetSection>
      )}
      {!!data.aggregate.length && (
        <BudgetSection title="Budgets without suite allocations">
          <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">These amounts have no matching registered-suite allocation. They are not per-suite allowances.</p>
          {data.aggregate.map(category => <div key={category.id} className="min-w-0 space-y-2 rounded-lg border p-3"><p className="break-words text-sm font-semibold">{category.description}</p><Amounts category={category} /></div>)}
          </div>
        </BudgetSection>
      )}
    </div>
  )
}
