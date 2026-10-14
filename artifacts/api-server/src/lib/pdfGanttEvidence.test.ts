import assert from "node:assert/strict";
import test from "node:test";
import { applyPdfGanttEvidence, dailyGridDates } from "./pdfGanttEvidence";
import type { BoardImportRawRow } from "./boardImportExtraction";

function labels(start: string, count: number) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000);
    return date.getUTCDate() === 1 ? months[date.getUTCMonth()] : String(date.getUTCDate());
  });
}

test("daily grid verification preserves the final column and handles month/year rollovers", () => {
  const dates = dailyGridDates(labels("2026-08-25", 60), "2026-08-25");
  assert.equal(dates?.[0], "2026-08-25");
  assert.equal(dates?.[59], "2026-10-23");
  assert.equal(dailyGridDates(labels("2026-12-25", 20), "2026-12-25")?.[19], "2027-01-13");
});

test("weekly grids, broken daily sequences, and absent year context are not treated as exact dates", () => {
  assert.equal(dailyGridDates(["1", "8", "15", "22", "29", "Feb", "8", "15", "22", "Mar"], "2026-01-01"), null);
  const broken = labels("2026-08-25", 60);
  broken[57] = "30";
  assert.equal(dailyGridDates(broken, "2026-08-25"), null);
  assert.equal(dailyGridDates(labels("2026-08-25", 60), null), null);
});

const task = (): BoardImportRawRow => ({
  rowNumber: 1, name: "Final Inspection", group: "Inspections", assignee: "", status: "",
  priority: "", startDate: "2026-10-21", endDate: "2026-10-21", cost: "",
});

test("source geometry corrects plausible but wrong AI dates and retains grey bars independently of category", () => {
  const row = task();
  applyPdfGanttEvidence([row], [{
    task: "Final Inspection", startDate: "2026-10-22", endDate: "2026-10-22", color: "#595959", page: 1,
  }]);
  assert.equal(row.startDate, "2026-10-22");
  assert.equal(row.sourceColor, "#595959");
  assert.equal(row.group, "Inspections");
  assert.match(row.dateEvidence!, /inclusive/);
});

test("ambiguous repeated task names are not overwritten with another task's bar", () => {
  const row = task();
  applyPdfGanttEvidence([row], [
    { task: row.name, startDate: "2026-10-22", endDate: "2026-10-22", color: "#595959", page: 1 },
    { task: row.name, startDate: "2026-10-23", endDate: "2026-10-23", color: "#595959", page: 2 },
  ]);
  assert.equal(row.startDate, "2026-10-21");
});
