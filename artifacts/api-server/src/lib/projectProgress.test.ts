import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProjectProgress,
  LEGACY_PROJECT_START_DATE,
  resolveProjectTimeline,
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

test("board dates override the project dates used for completion, with per-side fallbacks", () => {
  const project = { startDate: "2026-01-01", targetDate: "2026-01-11" };
  const timeline = resolveProjectTimeline(project, [
    { startDate: "2026-02-01", endDate: "2026-02-10" },
    { startDate: "2026-01-25", endDate: "2026-03-01" },
    { startDate: "2026-02-03", endDate: null },
  ]);

  assert.deepEqual(timeline, { startDate: "2026-01-25", targetDate: "2026-03-01" });
  assert.equal(
    calculateProjectProgress(timeline.startDate, timeline.targetDate, "2026-02-11"),
    48.6,
  );
  assert.deepEqual(resolveProjectTimeline(project, [{ endDate: "2026-03-01" }]), {
    startDate: project.startDate,
    targetDate: "2026-03-01",
  });
  assert.deepEqual(resolveProjectTimeline(project, []), project);
});
