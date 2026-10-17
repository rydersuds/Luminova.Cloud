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

test("an overall quote retains its details when it matches the contract total", () => {
  assert.deepEqual(resolveImportedClientQuote(79_925, {
    total: 79_925,
    quoteNumber: "Q-12",
    lineItems: [{ id: "line-1", description: "Renovation", amount: 79_925 }],
    isProjectTotal: true,
  }), {
    total: 79_925,
    revision: "Q-12",
    portions: [{ code: "line-1", label: "Renovation", amount: 79_925 }],
  });
});

test("an explicit contract total is preserved when an overall quote conflicts", () => {
  assert.deepEqual(resolveImportedClientQuote(79_925, {
    total: 81_000,
    quoteNumber: "Q-12",
    lineItems: [{ id: "line-1", description: "Renovation", amount: 81_000 }],
    isProjectTotal: true,
  }), {
    total: 79_925,
    revision: "",
    portions: [],
  });
});

test("a partial or change-order quote cannot replace the overall contract total", () => {
  assert.deepEqual(resolveImportedClientQuote(79_925, {
    total: 8_100,
    quoteNumber: "CO-12",
    lineItems: [{ id: "line-1", description: "Change order", amount: 8_100 }],
    isProjectTotal: false,
  }), {
    total: 79_925,
    revision: "",
    portions: [],
  });
});

test("an overall quote can supply the total when no contract total is available", () => {
  assert.deepEqual(resolveImportedClientQuote(undefined, {
    total: 81_000,
    quoteNumber: "Q-12",
    lineItems: [{ id: "line-1", description: "Renovation", amount: 81_000 }],
    isProjectTotal: true,
  }), {
    total: 81_000,
    revision: "Q-12",
    portions: [{ code: "line-1", label: "Renovation", amount: 81_000 }],
  });
});
