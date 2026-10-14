import assert from "node:assert/strict";
import test from "node:test";
import { resolveImportedClientQuote, resolveImportedProjectBudget } from "./projectImportFinancials";

test("a client contract total becomes a quote, not an internal budget", () => {
  assert.equal(resolveImportedProjectBudget(null, undefined), 0);
  assert.deepEqual(resolveImportedClientQuote(79_925), {
    total: 79_925,
    revision: "",
    portions: [],
  });
});

test("explicit internal budgets and client contract totals remain separate", () => {
  assert.equal(resolveImportedProjectBudget(null, 31_250.5), 31_250.5);
  assert.deepEqual(resolveImportedClientQuote(79_925), {
    total: 79_925,
    revision: "",
    portions: [],
  });
});

test("itemized internal budget extraction takes precedence over its project summary", () => {
  assert.equal(resolveImportedProjectBudget(28_400, 31_250.5), 28_400);
});

test("an extracted client quote record takes precedence over a contract-total fallback", () => {
  assert.deepEqual(resolveImportedClientQuote(79_925, {
    total: 81_000,
    quoteNumber: "Q-12",
    lineItems: [{ id: "line-1", description: "Renovation", amount: 81_000 }],
  }), {
    total: 81_000,
    revision: "Q-12",
    portions: [{ code: "line-1", label: "Renovation", amount: 81_000 }],
  });
});
