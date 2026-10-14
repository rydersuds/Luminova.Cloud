import type { InvoiceBudgetCategory } from "@workspace/api-zod";

export type CostCategory = {
  id: string;
  code: string;
  description: string;
  budgeted?: number | null;
  invoiced?: number | null;
};
export type PurchaseRecord = {
  amount: number;
  direction?: string;
  status?: string;
  lineItem?: string;
  budgetLineItemId?: string | null;
  submittedById?: string;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const cents = (value: number) => Math.round(value * 100);
const isCost = (invoice: PurchaseRecord) =>
  invoice.direction !== "luminova_to_client" &&
  !["rejected", "declined", "cancelled", "canceled", "void"].includes(normalize(invoice.status ?? "")) &&
  Number.isFinite(invoice.amount) && invoice.amount > 0;

function categoryForInvoice(categories: CostCategory[], invoice: PurchaseRecord) {
  if (invoice.budgetLineItemId) return categories.find(category => category.id === invoice.budgetLineItemId);
  const label = normalize(invoice.lineItem ?? "");
  const matches = categories.filter(category => [
    category.id, category.code, category.description, `${category.code} · ${category.description}`,
  ].some(candidate => candidate && normalize(candidate) === label));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Imported actuals are a baseline snapshot, not a live submitted-invoice ledger.
 * Reconcile duplicate imported invoices against that baseline, then add NEW
 * purchase submissions separately. Pending submissions also reserve budget.
 */
export function remainingTradeBudgets(categories: CostCategory[], invoices: PurchaseRecord[]): InvoiceBudgetCategory[] {
  const costs = invoices.filter(isCost);
  const unallocated = costs.filter(invoice => !categoryForInvoice(categories, invoice));
  // Legacy costs may already be fully covered by the imported actual snapshot.
  const snapshotTotal = categories.reduce((sum, category) =>
    sum + (Number.isFinite(category.invoiced) ? Math.max(cents(category.invoiced!), 0) : 0), 0);
  const legacyTotal = costs.filter(invoice => !invoice.submittedById)
    .reduce((sum, invoice) => sum + cents(invoice.amount), 0);
  const unknownCost = unallocated.some(invoice => invoice.submittedById) ||
    (unallocated.length > 0 && legacyTotal > snapshotTotal);

  return categories.map(category => {
    const matched = costs.filter(invoice => categoryForInvoice(categories, invoice)?.id === category.id);
    const legacy = matched.filter(invoice => !invoice.submittedById).reduce((sum, invoice) => sum + cents(invoice.amount), 0);
    const submitted = matched.filter(invoice => invoice.submittedById).reduce((sum, invoice) => sum + cents(invoice.amount), 0);
    const actual = Number.isFinite(category.invoiced) ? Math.max(cents(category.invoiced!), 0) : 0;
    const used = Math.max(actual, legacy) + submitted;
    const budgetKnown = typeof category.budgeted === "number" && Number.isFinite(category.budgeted) && category.budgeted >= 0;
    const budgeted = budgetKnown ? cents(category.budgeted!) : null;
    return {
      id: category.id, code: category.code, description: category.description,
      budgeted: budgeted === null ? null : budgeted / 100,
      used: used / 100,
      remaining: budgeted === null || unknownCost ? null : (budgeted - used) / 100,
      canAutoApprove: budgeted !== null && !unknownCost,
    };
  });
}

export function purchaseApproval(category: InvoiceBudgetCategory | undefined, amount: number) {
  if (!category?.canAutoApprove || category.remaining === null) {
    return {
      status: "Pending approval", approvalReason: "budget_unavailable" as const,
      overage: 0, budgetRemainingBefore: null, budgetRemainingAfter: null,
    };
  }
  const after = cents(category.remaining) - cents(amount);
  return {
    status: after >= 0 ? "Auto-approved" : "Pending approval",
    approvalReason: after >= 0 ? "within_budget" as const : "over_budget" as const,
    overage: Math.max(-after, 0) / 100,
    budgetRemainingBefore: category.remaining,
    budgetRemainingAfter: after / 100,
  };
}

/** A disabled project budget is a policy choice, not missing or unlimited budget evidence. */
export function externalAuthorizationDecision() {
  return {
    status: "Pending approval" as const,
    approvalReason: "external_authorization_required" as const,
    overage: 0,
    budgetRemainingBefore: null,
    budgetRemainingAfter: null,
  };
}

export type PurchaseCommitment = {
  kind: string;
  status: string;
  invoiceId: string | null;
  budgetLineItemId: string | null;
  amountCents: number;
  requestedById: string;
};

/**
 * Approved purchases that no invoice has claimed yet reserve their trade budget, so two people
 * can't both spend the same remaining money. Pending or declined requests reserve nothing, and an
 * invoice-kind approval never counts here because its invoice already carries the cost.
 */
export function commitmentRecords(approvals: PurchaseCommitment[]): PurchaseRecord[] {
  return approvals
    .filter(approval => approval.kind === "purchase" && !approval.invoiceId &&
      (approval.status === "Auto-approved" || approval.status === "Approved"))
    .map(approval => ({
      amount: approval.amountCents / 100,
      status: approval.status,
      budgetLineItemId: approval.budgetLineItemId,
      submittedById: approval.requestedById,
    }));
}
