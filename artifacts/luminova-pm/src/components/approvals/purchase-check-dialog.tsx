import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  createPurchaseApproval,
  getGetInvoiceProjectsQueryKey,
  getGetPurchaseApprovalsQueryKey,
  useGetInvoiceProjects,
  type InvoiceBudgetCategory,
  type PurchaseApproval,
} from "@workspace/api-client-react"
import { AlertTriangle, CheckCircle2, CircleHelp, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { money, verdictFor } from "./approval-model"

type Props = {
  /** Fix the project (on a project page); otherwise the person chooses one. */
  projectId?: string
  trigger: ReactNode
}

export function PurchaseCheckDialog({ projectId, trigger }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        {open && <PurchaseCheckForm projectId={projectId} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PurchaseCheckForm({ projectId: fixedProjectId, onDone }: { projectId?: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: projects, isLoading, isError, refetch } = useGetInvoiceProjects()
  const projectList = Array.isArray(projects) ? projects : []
  const invalidProjectData = projects !== undefined && !Array.isArray(projects)
  const [projectId, setProjectId] = useState(fixedProjectId ?? "")
  const [tradeId, setTradeId] = useState("")
  const [amountText, setAmountText] = useState("")
  const [vendor, setVendor] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<PurchaseApproval | null>(null)

  useEffect(() => {
    if (!projectId && projectList.length === 1) setProjectId(projectList[0].id)
  }, [projectList, projectId])

  const project = projectList.find((candidate) => candidate.id === projectId)
  const categories = Array.isArray(project?.categories) ? project.categories : []
  const trade: InvoiceBudgetCategory | undefined = categories.find((category) => category.id === tradeId)
  const externalAuthorization = project?.budgetEnabled === false
  const amount = Number(amountText.replace(/[$,\s]/g, ""))
  const amountValid = amountText.trim() !== "" && Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) / 100 === amount
  const verdict = useMemo(() => (trade && amountValid ? verdictFor(trade, amount) : null), [trade, amount, amountValid])
  const needsReason = externalAuthorization || verdict?.kind !== "within"
  const canSubmit = Boolean(project && amountValid && (
    externalAuthorization
      ? description.trim()
      : trade && (!needsReason || description.trim())
  )) && !submitting

  if (result) return <ResultView result={result} onDone={onDone} onAnother={() => {
    setResult(null); setAmountText(""); setVendor(""); setDescription("")
  }} />

  const submit = async () => {
    if (!project || !amountValid || (!externalAuthorization && !trade)) return
    setSubmitting(true)
    try {
      const created = await createPurchaseApproval({
        projectId: project.id,
        budgetLineItemId: externalAuthorization ? null : trade!.id,
        amount,
        vendor: vendor.trim() || null,
        description: description.trim() || `${trade!.description} purchase`,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetInvoiceProjectsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPurchaseApprovalsQueryKey() }),
      ])
      setResult(created)
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error
      toast({ title: "Purchase not recorded", description: message ?? "Check your connection and try again.", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (canSubmit) void submit() }}>
      <DialogHeader>
        <DialogTitle>Check a purchase</DialogTitle>
        <DialogDescription>
          {externalAuthorization
            ? "This project's budget is disabled. Record the purchase request and obtain authorization outside the app before proceeding."
            : "See right away whether it fits the trade's budget. Purchases that fit are approved now; anything over goes to an Admin."}
        </DialogDescription>
      </DialogHeader>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading budgets…</p> : isError || invalidProjectData ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" role="alert">
          Budgets couldn't be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button>
        </p>
      ) : !projectList.length ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">You don't manage any projects with a trade budget yet. Import a project with its budget, or ask an Admin to assign you.</p>
      ) : (
        <>
          {!fixedProjectId && (
            <div className="space-y-1.5">
              <Label htmlFor="purchase-project">Project</Label>
              <select id="purchase-project" className="hud-select w-full" value={projectId} onChange={(event) => { setProjectId(event.target.value); setTradeId("") }}>
                <option value="">Choose a project</option>
                {projectList.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </div>
          )}
          {project && !externalAuthorization && (
            <div className="space-y-1.5">
              <Label htmlFor="purchase-trade">Trade</Label>
              <select id="purchase-trade" className="hud-select w-full" value={tradeId} onChange={(event) => setTradeId(event.target.value)}>
                <option value="">Choose a trade</option>
                {project.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.description} ({category.code}){category.remaining === null ? "" : ` · ${money(category.remaining)} left`}
                  </option>
                ))}
              </select>
              {project.categories.length === 0 && <p className="text-xs text-muted-foreground">This project has no trade budgets yet.</p>}
            </div>
          )}
          {project && externalAuthorization && (
            <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              No trade limits will be checked. Leadership must authorize this purchase outside the app.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="purchase-amount">Amount (CAD, before tax)</Label>
              <Input id="purchase-amount" inputMode="decimal" placeholder="4500" value={amountText} onChange={(event) => setAmountText(event.target.value)} aria-invalid={amountText !== "" && !amountValid} />
              {amountText !== "" && !amountValid && <p className="text-xs text-destructive">Enter an amount like 4500 or 4500.50.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-vendor">Vendor <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="purchase-vendor" placeholder="Akal Drywalling" maxLength={200} value={vendor} onChange={(event) => setVendor(event.target.value)} />
            </div>
          </div>

          {verdict && trade && <Verdict verdict={verdict} trade={trade} />}

          <div className="space-y-1.5">
            <Label htmlFor="purchase-description">What is it for?{needsReason ? " (required)" : " (optional)"}</Label>
            <textarea
              id="purchase-description"
              className="recessed-3d min-h-[4.5rem] w-full px-3 py-2 text-sm outline-none"
              maxLength={500}
              placeholder={externalAuthorization ? "Describe the purchase requiring external authorization" : needsReason ? "Why it's needed and why it costs more than planned" : "Board and mud for level 2"}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Saving…" : externalAuthorization ? "Request external authorization" : verdict?.kind === "within" ? "Record approved purchase" : "Request approval"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Verdict({ verdict, trade }: { verdict: NonNullable<ReturnType<typeof verdictFor>>; trade: InvoiceBudgetCategory }) {
  const tone = verdict.kind === "within" ? "success" : verdict.kind === "over" ? "warning" : "muted"
  const Icon = verdict.kind === "within" ? CheckCircle2 : verdict.kind === "over" ? AlertTriangle : CircleHelp
  return (
    <div role="status" className={cn("approval-verdict", `approval-verdict-${tone}`)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{verdict.title}</p>
        <p className="text-sm opacity-90">{verdict.detail}</p>
        {trade.budgeted !== null && trade.remaining !== null && (
          <BudgetBar budgeted={trade.budgeted} used={trade.used} adding={verdict.amount} />
        )}
      </div>
    </div>
  )
}

/** Spent so far, this purchase, and what's left, on one bar. */
export function BudgetBar({ budgeted, used, adding = 0 }: { budgeted: number; used: number; adding?: number }) {
  const scale = Math.max(budgeted, used + adding, 1)
  const usedShare = Math.min(used, scale) / scale
  const addShare = Math.min(adding, scale - Math.min(used, scale)) / scale
  const over = used + adding > budgeted
  return (
    <div className="space-y-1">
      <div className="approval-bar" aria-hidden="true">
        <span className="approval-bar-used" style={{ width: `${usedShare * 100}%` }} />
        {adding > 0 && <span className={cn("approval-bar-adding", over && "approval-bar-over")} style={{ width: `${addShare * 100}%` }} />}
        {over && <span className="approval-bar-limit" style={{ left: `${(budgeted / scale) * 100}%` }} />}
      </div>
      <p className="text-xs tabular-nums opacity-80">
        {money(used)} used{adding > 0 ? ` + ${money(adding)} this purchase` : ""} of {money(budgeted)} budget
      </p>
    </div>
  )
}

function ResultView({ result, onDone, onAnother }: { result: PurchaseApproval; onDone: () => void; onAnother: () => void }) {
  const approved = result.status === "Auto-approved"
  const externalAuthorization = result.approvalReason === "external_authorization_required"
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{approved ? "Purchase approved" : "Approval requested"}</DialogTitle>
        <DialogDescription>
          {externalAuthorization
            ? `${money(result.amount)} for this project is recorded as pending. Obtain authorization from leadership outside the app before proceeding.`
            : approved
            ? `${money(result.amount)} for ${result.tradeLabel} is approved and set aside from the budget. Go ahead and buy it.`
            : `${money(result.amount)} for ${result.tradeLabel} is waiting for an Admin. Don't buy it until it's approved; check with your Project Manager for the decision.`}
        </DialogDescription>
      </DialogHeader>
      <div className={cn("approval-verdict", approved ? "approval-verdict-success" : "approval-verdict-warning")}>
        {approved ? <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> : <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <p className="text-sm">
          {externalAuthorization
            ? "No trade budget was checked. This request cannot be approved in the app."
            : approved
            ? result.remainingBefore !== null && `${money(result.remainingBefore - result.amount)} left on ${result.tradeLabel} after this purchase.`
            : result.remainingBefore === null
              ? "This trade has no reliable budget, so it always needs an Admin's approval."
              : `${money(result.overage)} over the ${money(result.remainingBefore)} left on this trade.`}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onAnother}>Check another</Button>
        <Button type="button" onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  )
}
