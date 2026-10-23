import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { suiteTradeBudgets, validateBudgetUnits, projectCostAllocations, type UnitBudgetProject } from "./unitTradeBudgets";
import { commitmentRecords, remainingTradeBudgets } from "./invoiceBudget";

const first = randomUUID(), second = randomUUID();
const project: UnitBudgetProject = {
  budgetLineItems: [{ id: "legacy", code: "IB-1", description: "Drywall", budgeted: 9000, invoiced: 0 }],
  budgetUnits: [{ id: first, label: "101", unitTypeId: "one" }, { id: second, label: "102", unitTypeId: "one" }],
  unitBudget: {
    total: 600,
    unitTypes: [{ id: "one", name: "1 Bedroom", unitCount: 2, perUnitTotal: 250, total: 500,
      categoryBudgets: [{ category: "Drywall", budgeted: 100 }, { category: "Paint", budgeted: 150 }],
      lineItems: [{ id: "detail", category: "Drywall", description: "Incomplete detail", unit: null, quantity: null, rate: null, budgeted: null }],
    }],
    sharedAreas: [{ id: "common", name: "Common areas", total: 100, lineItems: [] }],
  },
};

test("suite trade limits use exact source per-unit subtotals, not project-wide limits or partial detail", () => {
  const categories = suiteTradeBudgets(project, []);
  assert.deepEqual(categories.filter(item => item.unitId === first).map(item => item.budgeted), [100, 150]);
  assert.equal(categories.reduce((sum, item) => sum + item.budgeted!, 0), 600);
  const reserved = commitmentRecords([{
    kind: "purchase", status: "Auto-approved", invoiceId: null, budgetLineItemId: categories[0].id,
    amountCents: 8000, requestedById: "pm",
  }]);
  const used = suiteTradeBudgets(project, reserved);
  assert.equal(used[0].remaining, 20);
  assert.equal(used[2].remaining, 100);
  assert.equal(used[4].remaining, 100);
});

test("unassigned historical costs and incomplete source detail never produce a guessed suite remainder", () => {
  const historical = { ...project, budgetLineItems: [{ ...project.budgetLineItems![0], invoiced: 30 }] };
  assert.ok(suiteTradeBudgets(historical, []).every(item => !item.canAutoApprove && item.remaining === null));
  const incomplete = structuredClone(project);
  delete incomplete.unitBudget!.unitTypes[0].categoryBudgets;
  const suite = suiteTradeBudgets(incomplete, []).filter(item => item.scopeKind === "suite");
  assert.ok(suite.every(item => item.budgeted === null && !item.canAutoApprove));
  const legacy = suiteTradeBudgets(project, [{ amount: 50, lineItem: "Drywall", submittedById: "pm" }]);
  assert.ok(legacy.every(item => !item.canAutoApprove));
  const oneSuite = { ...project, budgetUnits: [project.budgetUnits![0]] };
  const unassigned = suiteTradeBudgets(oneSuite, [{ amount: 50, lineItem: "Drywall" }]);
  assert.ok(unassigned.every(item => !item.canAutoApprove));
  assert.equal(unassigned[0].used, 0, "a unique label match is not permission to assign old costs");
});

test("suite register rejects duplicate labels, unknown types, and counts above source quantities", () => {
  assert.equal(validateBudgetUnits(project, project.budgetUnits!), null);
  assert.match(validateBudgetUnits(project, [...project.budgetUnits!, { id: randomUUID(), label: "103", unitTypeId: "one" }])!, /allows 2/);
  assert.match(validateBudgetUnits(project, [{ id: first, label: "101", unitTypeId: "absent" }])!, /dwelling type/);
  assert.match(validateBudgetUnits(project, [{ id: first, label: "101", unitTypeId: "one" }, { id: second, label: " 101 ", unitTypeId: "one" }])!, /unique/);
});

test("suite expenses roll up to the matching project trade without modifying suite allocations", () => {
  const categories = suiteTradeBudgets(project, []);
  const costs = [
    { amount: 10, budgetLineItemId: categories[0].id, submittedById: "pm" },
    { amount: 20, budgetLineItemId: categories[2].id, submittedById: "pm" },
  ];
  const rolledUp = remainingTradeBudgets(project.budgetLineItems!, projectCostAllocations(project, costs));
  assert.equal(rolledUp[0].used, 30);
  assert.equal(suiteTradeBudgets(project, costs)[0].used, 10);
  assert.equal(suiteTradeBudgets(project, costs)[2].used, 20);
});
