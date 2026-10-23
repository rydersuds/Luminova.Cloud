import assert from "node:assert/strict"
import test from "node:test"
import type { InvoiceBudgetCategory, InvoiceProject } from "@workspace/api-client-react"
import { tradeUnitBreakdown } from "./trade-unit-breakdown.ts"

const category = (id: string, unitId: string, code: string, budgeted: number | null): InvoiceBudgetCategory => ({
  id, unitId, unitLabel: unitId, unitTypeName: unitId === "a" ? "One bedroom" : "Two bedroom",
  scopeKind: "suite", code, description: code, budgeted, used: 20,
  remaining: budgeted === null ? null : budgeted - 20, canAutoApprove: budgeted !== null,
})
const project = (): InvoiceProject => ({
  id: "project-1", name: "Registered suites", budgetEnabled: true, unitBudgetEnabled: true,
  units: [{ id: "a", label: "101", unitTypeId: "one" }, { id: "b", label: "PH 2", unitTypeId: "two" }],
  unitTypes: [
    { id: "one", name: "One bedroom", unitCount: 2, perUnitTotal: 150, total: 300 },
    { id: "two", name: "Two bedroom", unitCount: 1, perUnitTotal: 250, total: 250 },
  ],
  categories: [
    category("original-a-drywall", "a", "Drywall", 100),
    category("original-b-drywall", "b", " ＤＲＹＷＡＬＬ ", 200),
    category("a-paint", "a", "Paint", 50), category("b-paint", "b", "Paint", 50),
    { ...category("shared", "common", "Drywall", 300), scopeKind: "shared" },
  ],
})

test("groups normalized trades across dwelling types without rewriting IDs, values or source objects", () => {
  const input = project(), before = structuredClone(input)
  const result = tradeUnitBreakdown(input)
  assert.equal(result.trades.length, 2)
  assert.equal(result.trades[0].registeredBudget, 300)
  assert.equal(result.trades[1].registeredBudget, 100)
  assert.deepEqual(result.trades[0].rows.map(row => row.unit.label), ["101", "PH 2"])
  assert.equal(result.trades[0].rows[1].category, input.categories[1])
  assert.deepEqual(result.trades[0].rows.map(row => row.category?.remaining), [80, 180])
  assert.equal(result.shared.length, 1)
  assert.equal(result.registeredCount, 2)
  assert.equal(result.sourceCount, 3)
  assert.deepEqual(input, before)
})

test("unknown, missing and ambiguous source limits never become zero subtotals", () => {
  const input = project()
  input.categories[0].budgeted = null
  assert.equal(tradeUnitBreakdown(input).trades[0].registeredBudget, null)
  input.categories = input.categories.filter(category => category.id !== "b-paint")
  const paint = tradeUnitBreakdown(input).trades[1]
  assert.equal(paint.registeredBudget, null)
  assert.equal(paint.rows[1].category, undefined)
  input.categories.push({ ...input.categories[0], id: "duplicate" })
  assert.equal(tradeUnitBreakdown(input).trades[0].rows[0].category, undefined)
})

test("historical unallocated costs preserve unverified remainders and recorded-only usage", () => {
  const input = project()
  input.categories.forEach(category => { category.remaining = null; category.canAutoApprove = false })
  input.allocationWarning = "Historical costs have not been assigned to suites."
  const result = tradeUnitBreakdown(input)
  assert.equal(result.trades[0].registeredBudget, 300)
  assert.ok(result.trades[0].rows.every(row => row.category?.remaining === null))
  assert.equal(result.trades[0].rows[0].category?.used, 20)
})

test("no registrations or aggregate budgets cannot fabricate unit allocations", () => {
  const input = project()
  input.units = []
  assert.equal(tradeUnitBreakdown(input).trades.length, 0)
  const legacy = { ...input, unitBudgetEnabled: false, categories: [{
    id: "legacy", code: "IB-1", description: "Drywall", budgeted: 9000,
    used: 400, remaining: 8600, canAutoApprove: true,
  }] }
  assert.deepEqual(tradeUnitBreakdown(legacy).aggregate, legacy.categories)
  assert.equal(tradeUnitBreakdown(legacy).trades.length, 0)
})
