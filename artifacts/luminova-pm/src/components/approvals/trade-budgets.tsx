import { getGetInvoiceProjectsQueryKey, useGetCurrentWorkspaceUser, useGetInvoiceProjects } from "@workspace/api-client-react"
import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BudgetBar, PurchaseCheckDialog } from "./purchase-check-dialog"
import { SuiteRegister } from "./suite-register"
import { scopesOf, scopeKeyOf, isUnitProject } from "./suite-scope"
import { money } from "./approval-model"

/** Each trade's budget, what's committed, and what's left, with a shortcut to check a purchase. */
export function TradeBudgets({ projectId }: { projectId: string }) {
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const canUse = currentUser?.role === "Admin" || currentUser?.role === "Project Manager"
  const { data: projects, isLoading, isError, refetch } = useGetInvoiceProjects({ query: { enabled: canUse, queryKey: getGetInvoiceProjectsQueryKey() } })
  const [scope, setScope] = useState("")
  if (!canUse) return null
  const projectList = Array.isArray(projects) ? projects : undefined
  const invalidProjectData = projects !== undefined && projectList === undefined
  const project = projectList?.find((candidate) => candidate.id === projectId)

  const unit = isUnitProject(project)
  const scopes = scopesOf(project)
  const selectedScope = scopes.some(option => option.key === scope) ? scope : scopes[0]?.key ?? ""
  const shown = unit ? (project?.categories ?? []).filter((c) => scopeKeyOf(c) === selectedScope) : project?.categories ?? []
  return (
    <section className="surface-3d space-y-4 p-5" aria-labelledby="trade-budgets-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trade-budgets-heading" className="text-lg font-bold">Trade budgets</h2>
          <p className="text-sm text-muted-foreground">Purchases within what's left are approved automatically. Over budget needs an Admin.{unit && " Each suite or shared area has its own limits."}</p>
        </div>
        {project && (project.categories.length > 0) && (
          <PurchaseCheckDialog projectId={projectId} trigger={<Button><Plus className="mr-1.5 h-4 w-4" />Check a purchase</Button>} />
        )}
      </div>
      {unit && project && (
        <>
          {project.allocationWarning && <p role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm font-semibold text-warning" data-testid="text-allocation-warning">{project.allocationWarning}</p>}
          <SuiteRegister project={project} />
          {scopes.length > 0 && (
            <select aria-label="Suite or shared area" className="hud-select w-full sm:w-auto" value={selectedScope} onChange={(e) => setScope(e.target.value)} data-testid="select-budget-scope">
              {scopes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          )}
        </>
      )}
      {(isError || invalidProjectData) ? (
        <p className="board-empty" role="alert">Trade budgets couldn't be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></p>
      ) : isLoading ? <div className="skeleton-line h-16" aria-busy="true" /> : !project || project.categories.length === 0 ? (
        <p className="board-empty">{unit ? "Register suites above to create their trade budgets." : "This project has no trade budgets yet, so purchases can't be checked automatically."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((trade) => {
            const over = trade.remaining !== null && trade.remaining < 0
            return (
              <li key={trade.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,2fr)_8rem] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{trade.description}</p>
                  <p className="text-xs text-muted-foreground">{trade.code}</p>
                </div>
                {trade.budgeted !== null ? <BudgetBar budgeted={trade.budgeted} used={trade.used} /> : (
                  <p className="text-xs text-muted-foreground">No budget set. Every purchase needs approval.</p>
                )}
                <p className={cn("text-right text-sm font-semibold tabular-nums", over && "text-destructive")}>
                  {trade.remaining === null ? "—" : over ? `${money(-trade.remaining)} over` : `${money(trade.remaining)} left`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
