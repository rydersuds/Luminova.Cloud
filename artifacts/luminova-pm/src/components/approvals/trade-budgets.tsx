import { getGetInvoiceProjectsQueryKey, useGetCurrentWorkspaceUser, useGetInvoiceProjects } from "@workspace/api-client-react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BudgetSection } from "@/components/budget-section"
import { cn } from "@/lib/utils"
import { BudgetBar, PurchaseCheckDialog } from "./purchase-check-dialog"
import { SuiteRegister } from "./suite-register"
import { isUnitProject } from "./suite-scope"
import { TradeUnitBreakdown } from "./trade-unit-breakdown"
import { money } from "./approval-model"

/** Each trade's budget, what's committed, and what's left, with a shortcut to check a purchase. */
export function TradeBudgets({ projectId }: { projectId: string }) {
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const canUse = currentUser?.role === "Admin" || currentUser?.role === "Project Manager"
  const { data: projects, isLoading, isError, refetch } = useGetInvoiceProjects({ query: { enabled: canUse, queryKey: getGetInvoiceProjectsQueryKey() } })
  if (!canUse) return null
  const projectList = Array.isArray(projects) ? projects : undefined
  const invalidProjectData = projects !== undefined && projectList === undefined
  const project = projectList?.find((candidate) => candidate.id === projectId)

  const unit = isUnitProject(project)
  const shown = project?.categories ?? []
  return (
    <BudgetSection title="Trade budgets"
      description={<>Purchases within what's left are approved automatically. Over budget needs an Admin.{unit && " Each suite or shared area has its own limits."}</>}
      className="surface-3d">
      <div className="space-y-4 px-5 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {project && (project.categories.length > 0) && (
          <PurchaseCheckDialog projectId={projectId} trigger={<Button><Plus className="mr-1.5 h-4 w-4" />Check a purchase</Button>} />
        )}
      </div>
      {unit && project && (
        <>
          {project.allocationWarning && <p role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm font-semibold text-warning" data-testid="text-allocation-warning">{project.allocationWarning}</p>}
          <BudgetSection title="Suite register">
            <div className="px-4 pb-4"><SuiteRegister project={project} /></div>
          </BudgetSection>
        </>
      )}
      {(isError || invalidProjectData) ? (
        <p className="board-empty" role="alert">Trade budgets couldn't be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></p>
      ) : isLoading ? <div className="skeleton-line h-16" aria-busy="true" /> : unit && project ? (
        <TradeUnitBreakdown project={project} />
      ) : !project || project.categories.length === 0 ? (
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
      </div>
    </BudgetSection>
  )
}
