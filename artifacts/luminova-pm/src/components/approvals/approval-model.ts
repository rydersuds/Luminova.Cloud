import type { InvoiceBudgetCategory, PurchaseApprovalStatus } from "@workspace/api-client-react"

export const money = (value: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)

export type Verdict = {
  kind: "within" | "over" | "unknown"
  amount: number
  title: string
  detail: string
}

/**
 * The same rule the server applies, shown before anything is saved: within the trade's remaining
 * budget is approved on the spot; over it, or with no reliable budget, needs an Admin.
 */
export function verdictFor(trade: InvoiceBudgetCategory, amount: number): Verdict {
  if (!trade.canAutoApprove || trade.remaining === null) {
    return {
      kind: "unknown",
      amount,
      title: "Needs an Admin's approval",
      detail: `${trade.description} has no reliable budget yet, so every purchase on it needs approval.`,
    }
  }
  const after = Math.round((trade.remaining - amount) * 100) / 100
  if (after >= 0) {
    return {
      kind: "within",
      amount,
      title: "Within budget, approved now",
      detail: `${money(trade.remaining)} left on ${trade.description}; ${money(after)} left after this purchase.`,
    }
  }
  return {
    kind: "over",
    amount,
    title: `Over budget by ${money(-after)}`,
    detail: trade.remaining > 0
      ? `${trade.description} has ${money(trade.remaining)} left. An Admin has to approve this before you buy.`
      : `${trade.description} has no budget left. An Admin has to approve this before you buy.`,
  }
}

export const STATUS_STYLE: Record<PurchaseApprovalStatus, string> = {
  "Auto-approved": "approval-status-auto",
  "Pending approval": "approval-status-pending",
  Approved: "approval-status-approved",
  Declined: "approval-status-declined",
}
