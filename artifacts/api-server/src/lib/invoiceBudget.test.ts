import assert from "node:assert/strict";
import test from "node:test";
import { remainingTradeBudgets, purchaseApproval } from "./invoiceBudget";

const drywall = { id: "drywall", code: "09 29 00", description: "Drywall", budgeted: 10000, invoiced: 2000 };

test("trade approval reconciles imported costs then reserves every new submission", () => {
  const [category] = remainingTradeBudgets([drywall], [
    { amount: 2000, lineItem: "09 29 00 · Drywall", direction: "company_to_luminova" },
    { amount: 1000, budgetLineItemId: "drywall", submittedById: "pm", status: "Auto-approved" },
    { amount: 500, budgetLineItemId: "drywall", submittedById: "pm", status: "Pending approval" },
    { amount: 99999, lineItem: "Drywall", direction: "luminova_to_client" },
    { amount: 99999, lineItem: "Drywall", status: "Rejected" },
  ]);
  assert.equal(category.used, 3500);
  assert.equal(category.remaining, 6500);
  assert.equal(purchaseApproval(category, 6500).status, "Auto-approved");
  assert.deepEqual(purchaseApproval(category, 6500.01), {
    status: "Pending approval", approvalReason: "over_budget", overage: 0.01,
    budgetRemainingBefore: 6500, budgetRemainingAfter: -0.01,
  });
});

test("missing and unpriced budgets never auto-approve, and unknown costs fail closed", () => {
  assert.equal(purchaseApproval(undefined, 1).approvalReason, "budget_unavailable");
  const [unpriced] = remainingTradeBudgets([{ ...drywall, budgeted: null }], []);
  assert.equal(purchaseApproval(unpriced, 1).status, "Pending approval");
  const [unknown] = remainingTradeBudgets([drywall], [{ amount: 3000, lineItem: "Other" }]);
  assert.equal(unknown.remaining, null);
  assert.equal(unknown.canAutoApprove, false);
  const [covered] = remainingTradeBudgets([drywall], [{ amount: 2000, lineItem: "Legacy unknown" }]);
  assert.equal(covered.remaining, 8000);
  const [newUnallocated] = remainingTradeBudgets([drywall], [{ amount: 1, lineItem: "Unknown", submittedById: "pm" }]);
  assert.equal(newUnallocated.canAutoApprove, false);
});

test("zero and exceeded trade budgets stay explicit without rounding leaks", () => {
  const [zero] = remainingTradeBudgets([{ ...drywall, budgeted: 0, invoiced: 0 }], []);
  assert.equal(purchaseApproval(zero, 0.01).overage, 0.01);
  const [category] = remainingTradeBudgets([{ ...drywall, budgeted: 0.3, invoiced: 0.1 }], [
    { amount: 0.1, budgetLineItemId: "drywall", submittedById: "pm" },
  ]);
  assert.equal(category.remaining, 0.1);
  assert.equal(purchaseApproval(category, 0.1).status, "Auto-approved");
});