import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProjectProgress,
  LEGACY_PROJECT_START_DATE,
  resolveProjectStartDate,
} from "./projectProgress";

test("calculates date-driven progress at the calendar boundaries", () => {
  assert.equal(calculateProjectProgress("2026-01-01", "2026-01-11", "2025-12-31"), 0);
  assert.equal(calculateProjectProgress("2026-01-01", "2026-01-11", "2026-01-01"), 0);
  assert.equal(calculateProjectProgress("2026-01-01", "2026-01-11", "2026-01-06"), 50);
  assert.equal(calculateProjectProgress("2026-01-01", "2026-01-11", "2026-01-11"), 100);
  assert.equal(calculateProjectProgress("2026-01-01", "2026-01-11", "2026-01-12"), 100);
});

test("handles invalid and reversed date ranges safely", () => {
  assert.equal(calculateProjectProgress("", "2026-01-11", "2026-01-06"), 0);
  assert.equal(calculateProjectProgress("2026-02-30", "2026-03-11", "2026-03-01"), 0);
  assert.equal(calculateProjectProgress("2026-01-11", "2026-01-01", "2026-01-06"), 0);
  assert.equal(calculateProjectProgress("2026-01-11", "2026-01-01", "2026-01-01"), 0);
});

test("uses a deterministic legacy start date without overwriting a valid start", () => {
  assert.equal(resolveProjectStartDate({ startDate: "2026-03-01", targetDate: "2026-12-31" }), "2026-03-01");
  assert.equal(resolveProjectStartDate({ targetDate: "2026-12-31" }), "2026-12-31");
  assert.equal(resolveProjectStartDate({ targetDate: "" }), LEGACY_PROJECT_START_DATE);
});