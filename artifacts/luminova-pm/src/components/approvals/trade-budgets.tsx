import { getGetInvoiceProjectsQueryKey, useGetCurrentWorkspaceUser, useGetInvoiceProjects } from "@workspace/api-client-react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BudgetBar, PurchaseCheckDialog } from "./purchase-check-dialog"
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

  return (
    <section className="surface-3d space-y-4 p-5" aria-labelledby="trade-budgets-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trade-budgets-heading" className="text-lg font-bold">Trade budgets</h2>
          <p className="text-sm text-muted-foreground">Purchases within what's left are approved automatically. Over budget needs an Admin.</p>
        </div>
        {project && project.categories.length > 0 && (
          <PurchaseCheckDialog projectId={projectId} trigger={<Button><Plus className="mr-1.5 h-4 w-4" />Check a purchase</Button>} />
        )}
      </div>
      {(isError || invalidProjectData) ? (
        <p className="board-empty" role="alert">Trade budgets couldn't be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></p>
      ) : isLoading ? <div className="skeleton-line h-16" aria-busy="true" /> : !project || project.categories.length === 0 ? (
        <p className="board-empty">This project has no trade budgets yet, so purchases can't be checked automatically.</p>
      ) : (
        <ul className="divide-y divide-border">
          {project.categories.map((trade) => {
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
