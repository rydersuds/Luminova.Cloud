import assert from "node:assert/strict";
import test from "node:test";
import { GetFinancialSummaryResponse } from "@workspace/api-zod";
import { calculatePortfolioFinancialSummary, type FinancialInvoice, type FinancialQuote, type FinancialProject } from "./financialSummary";

const quote = (overrides: Partial<FinancialQuote> = {}): FinancialQuote => ({
  id: "quote-1",
  quoteNumber: "Q-1",
  projectId: "project-1",
  direction: "luminova_to_client",
  isProjectTotal: false,
  status: "Accepted",
  revision: 1,
  issueDate: "2026-01-01",
  createdAt: "2026-01-01T00:00:00.000Z",
  total: 1000,
  ...overrides,
});

const invoice = (overrides: Partial<FinancialInvoice> = {}): FinancialInvoice => ({
  projectId: "project-1",
  amount: 100,
  direction: "luminova_to_client",
  ...overrides,
});

const project = (overrides: Partial<FinancialProject> = {}): FinancialProject => ({
  projectId: "project-1",
  ...overrides,
});

test("aggregates revenue, expenses, and remaining accepted client value across projects", () => {
  const summary = calculatePortfolioFinancialSummary(
    [
      invoice({ amount: 300 }),
      invoice({ projectId: "project-2", amount: 250 }),
      invoice({ amount: 120, direction: "company_to_luminova" }),
      invoice({ projectId: "project-2", amount: 80, direction: undefined }),
    ],
    [
      quote({ total: 1000, isProjectTotal: true }),
      quote({ id: "quote-2", quoteNumber: "Q-2", projectId: "project-2", total: 700 }),
    ],
  );

  assert.deepEqual(GetFinancialSummaryResponse.parse(summary), {
    invoicedRevenue: 550,
    invoicedExpenses: 200,
    acceptedClientQuoteValue: 1700,
    upcomingClientPayments: 1150,
  });
});

test("only counts accepted outgoing quotes and keeps the latest accepted revision", () => {
  const summary = calculatePortfolioFinancialSummary([], [
    quote({ id: "old", revision: 1, total: 800 }),
    quote({ id: "new", revision: 2, total: 950 }),
    quote({ id: "draft", quoteNumber: "Q-2", status: "Draft", total: 500 }),
    quote({ id: "vendor", quoteNumber: "Q-3", direction: "company_to_luminova", total: 400 }),
  ]);

  assert.equal(summary.acceptedClientQuoteValue, 950);
  assert.equal(summary.upcomingClientPayments, 950);
});

test("a latest project-total quote prevents overlapping scope quotes from being added", () => {
  const summary = calculatePortfolioFinancialSummary([], [
    quote({ id: "scope-1", quoteNumber: "S-1", total: 300 }),
    quote({ id: "scope-2", quoteNumber: "S-2", total: 400 }),
    quote({ id: "project-old", quoteNumber: "P-1", revision: 9, issueDate: "2026-01-01", isProjectTotal: true, total: 900 }),
    quote({ id: "project-new", quoteNumber: "P-2", revision: 1, issueDate: "2026-02-01", isProjectTotal: true, total: 1100 }),
  ]);

  assert.equal(summary.acceptedClientQuoteValue, 1100);
});

test("floors each over-invoiced project's remainder before portfolio aggregation", () => {
  const summary = calculatePortfolioFinancialSummary(
    [invoice({ amount: 1200 }), invoice({ projectId: "project-2", amount: 100 })],
    [
      quote({ total: 1000, isProjectTotal: true }),
      quote({ id: "quote-2", quoteNumber: "Q-2", projectId: "project-2", total: 500 }),
    ],
  );

  assert.equal(summary.upcomingClientPayments, 400);
});

test("uses persisted project financial evidence for legacy imported records", () => {
  const summary = calculatePortfolioFinancialSummary(
    [{ projectId: "project-1", amount: 446070.71, direction: "luminova_to_client" }],
    [],
    [project({
      clientQuoteTotal: 942715.84,
      internalExpenseTotal: 196801.5,
    })],
  );

  assert.deepEqual(summary, {
    invoicedRevenue: 446070.71,
    invoicedExpenses: 196801.5,
    acceptedClientQuoteValue: 942715.84,
    upcomingClientPayments: 496645.13,
  });
});