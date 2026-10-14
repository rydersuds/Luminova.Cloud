import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  decidePurchaseApproval,
  getGetInvoiceProjectsQueryKey,
  getGetInvoicesQueryKey,
  getGetPurchaseApprovalsQueryKey,
  useGetCurrentWorkspaceUser,
  useGetPurchaseApprovals,
  type PurchaseApproval,
  type PurchaseApprovalStatus,
} from "@workspace/api-client-react"
import { Link } from "wouter"
import { Check, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PurchaseCheckDialog } from "@/components/approvals/purchase-check-dialog"
import { STATUS_STYLE, money } from "@/components/approvals/approval-model"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const FILTERS: Array<{ id: "all" | PurchaseApprovalStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "Pending approval", label: "Waiting" },
  { id: "Approved", label: "Approved" },
  { id: "Auto-approved", label: "Auto-approved" },
  { id: "Declined", label: "Declined" },
]

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

export default function ApprovalsPage() {
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const role = currentUser?.role
  const canUse = role === "Admin" || role === "Project Manager"
  const isAdmin = role === "Admin"
  const { data: approvals, isLoading, isError, refetch } = useGetPurchaseApprovals({
    query: { enabled: canUse, queryKey: getGetPurchaseApprovalsQueryKey() },
  })
  const approvalList = Array.isArray(approvals) ? approvals : undefined
  const invalidApprovalData = approvals !== undefined && approvalList === undefined
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all")

  const pending = useMemo(() => (approvalList ?? []).filter((approval) => approval.status === "Pending approval"), [approvalList])
  const history = useMemo(() => (approvalList ?? []).filter((approval) => filter === "all" || approval.status === filter), [approvalList, filter])

  if (role && !canUse) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <p className="board-empty">Approvals are for Admins and Project Managers. Ask your Project Manager to check a purchase for you.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 md:p-8">
      <header className="hud-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-kicker">Budget control</p>
          <h1 className="mt-2">Approvals</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Purchases within an enabled trade budget are approved automatically; over-budget requests wait here for an Admin. Requests for projects with budgeting disabled require external authorization.
          </p>
        </div>
        <PurchaseCheckDialog trigger={<Button><Plus className="mr-1.5 h-4 w-4" />Check a purchase</Button>} />
      </header>

      {isLoading && <div className="space-y-3" aria-busy="true" aria-label="Loading approvals">{[0, 1].map((key) => <div key={key} className="skeleton-line h-24" />)}</div>}
      {(isError || invalidApprovalData) && <p className="board-empty" role="alert">Approvals couldn't be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></p>}

      {approvalList && (
        <section aria-labelledby="waiting-heading" className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 id="waiting-heading" className="text-lg font-bold">
              {pending.some((approval) => approval.approvalReason === "external_authorization_required")
                ? "Pending requests"
                : isAdmin ? "Waiting for your approval" : "Waiting for an Admin"}
            </h2>
            <span className="approval-count">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <p className="board-empty">Nothing is waiting. Over-budget purchases and invoices will appear here.</p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {pending.map((approval) => <PendingCard key={approval.id} approval={approval} isAdmin={isAdmin} />)}
            </div>
          )}
        </section>
      )}

      {approvalList && (
        <section aria-labelledby="history-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="history-heading" className="text-lg font-bold">All spending checks</h2>
            <div className="hud-segment" role="group" aria-label="Filter by status">
              {FILTERS.map((option) => (
                <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>
              ))}
            </div>
          </div>
          {history.length === 0 ? <p className="board-empty">No spending checks match this filter yet.</p> : (
            <div className="board-scroll">
              <table className="approval-table">
                <thead>
                  <tr>
                    <th scope="col">Requested</th>
                    <th scope="col">Project and trade</th>
                    <th scope="col">What</th>
                    <th scope="col" className="text-right">Amount</th>
                    <th scope="col" className="text-right">Over by</th>
                    <th scope="col">Status</th>
                    <th scope="col">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((approval) => (
                    <tr key={approval.id}>
                      <td className="whitespace-nowrap">
                        <span className="block font-medium">{approval.requestedByName}</span>
                        <span className="block text-xs text-muted-foreground">{when(approval.requestedAt)}</span>
                      </td>
                      <td>
                        <Link href={`/projects/${approval.projectId}?tab=budget`} className="block font-medium hover:text-primary">{approval.projectName}</Link>
                        <span className="block text-xs text-muted-foreground">{approval.tradeLabel}</span>
                      </td>
                      <td className="max-w-[22rem]">
                        <span className="block truncate" title={approval.description}>{approval.description}</span>
                        <span className="block text-xs text-muted-foreground">{approval.kind === "invoice" ? "Invoice" : "Purchase check"}{approval.vendor ? ` · ${approval.vendor}` : ""}</span>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{money(approval.amount)}</td>
                      <td className="text-right tabular-nums">{approval.overage > 0 ? money(approval.overage) : <span className="text-muted-foreground">—</span>}</td>
                      <td><span className={cn("approval-status", STATUS_STYLE[approval.status])}>{approval.status}</span></td>
                      <td className="text-xs text-muted-foreground">
                        {approval.decidedByName ? (
                          <>
                            <span className="block text-foreground">{approval.decidedByName} · {approval.decidedAt && when(approval.decidedAt)}</span>
                            {approval.budgetIncrease ? <span className="block">Budget raised {money(approval.budgetIncrease)}</span> : null}
                            {approval.decisionNote && <span className="block">“{approval.decisionNote}”</span>}
                          </>
                        ) : approval.approvalReason === "external_authorization_required"
                          ? "External authorization required"
                          : approval.status === "Auto-approved" ? "Within budget" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function PendingCard({ approval, isAdmin }: { approval: PurchaseApproval; isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [note, setNote] = useState("")
  const [raiseBudget, setRaiseBudget] = useState(true)
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null)
  const canRaise = approval.overage > 0 && approval.budgetLineItemId !== null
  const externalAuthorization = approval.approvalReason === "external_authorization_required"

  const decide = async (decision: "approve" | "decline") => {
    setBusy(decision)
    try {
      await decidePurchaseApproval(approval.id, { decision, note: note.trim() || null, raiseBudget: decision === "approve" && canRaise && raiseBudget })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPurchaseApprovalsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInvoiceProjectsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInvoicesQueryKey() }),
      ])
      toast({ title: decision === "approve" ? "Approved" : "Declined", description: "This decision is saved in spending history." })
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error
      toast({ title: "Decision not saved", description: message ?? "Check your connection and try again.", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="surface-3d space-y-3 p-4" aria-label={`${approval.tradeLabel} for ${approval.projectName}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{approval.projectName}</p>
          <h3 className="mt-0.5 text-base font-bold">{approval.tradeLabel}</h3>
          <p className="text-sm text-muted-foreground">{approval.kind === "invoice" ? "Invoice" : "Purchase"}{approval.vendor ? ` from ${approval.vendor}` : ""} · {approval.requestedByName} · {when(approval.requestedAt)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tabular-nums">{money(approval.amount)}</p>
          <p className="text-sm font-semibold text-[hsl(var(--warning))]">
            {externalAuthorization
              ? "External authorization required"
              : approval.remainingBefore === null ? "No budget set" : `${money(approval.overage)} over · ${money(approval.remainingBefore)} was left`}
          </p>
        </div>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{approval.description}</p>
      {externalAuthorization ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Budget tracking is disabled for this project. Contact leadership outside the app for authorization; this request cannot be approved here.
        </p>
      ) : isAdmin ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Note to {approval.requestedByName} (optional)</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Why you approved or declined it" />
          </label>
          {canRaise && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={raiseBudget} onChange={(event) => setRaiseBudget(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
              <span>When approving, raise the {approval.tradeLabel.split(" · ").pop()} budget by {money(approval.overage)} so it covers this.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void decide("approve")} disabled={busy !== null}><Check className="mr-1.5 h-4 w-4" />{busy === "approve" ? "Approving…" : "Approve"}</Button>
            <Button type="button" variant="outline" onClick={() => void decide("decline")} disabled={busy !== null}><X className="mr-1.5 h-4 w-4" />{busy === "decline" ? "Declining…" : "Decline"}</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">An Admin will approve or decline this. Don't buy until it's approved.</p>
      )}
    </article>
  )
}
