import assert from "node:assert/strict"
import test from "node:test"
import { adjustTimelineSpan, boardDayTimelineRange, datedTimelineEntries, itemsForDay, parseDay } from "../components/board/board-model.ts"

test("day view includes every day in a task range and handles one-sided dates", () => {
  const day = parseDay("2026-06-12")!
  const items = [
    { id: "spans-day", startDate: "2026-06-10", endDate: "2026-06-14" },
    { id: "starts-day", startDate: "2026-06-12", endDate: null },
    { id: "ends-day", startDate: null, endDate: "2026-06-12" },
    { id: "other-day", startDate: "2026-06-13", endDate: "2026-06-15" },
    { id: "undated", startDate: null, endDate: null },
  ]

  assert.deepEqual(
    itemsForDay(items, day).map((item) => item.id),
    ["spans-day", "starts-day", "ends-day"],
  )
})

test("day timeline range is continuous around today and includes the full task schedule", () => {
  const today = parseDay("2026-06-12")!
  const range = boardDayTimelineRange([
    { startDate: "2026-05-01", endDate: "2026-05-03" },
    { startDate: null, endDate: "2026-08-20" },
    { startDate: null, endDate: null },
  ], today)

  assert.deepEqual(range, {
    start: parseDay("2026-04-17"),
    end: parseDay("2026-09-03"),
  })
  assert.equal(range.end - range.start + 1, 140)
})

test("timeline date editing moves and resizes a task span without crossing its other edge", () => {
  const span = { start: 100, end: 104 }

  assert.deepEqual(adjustTimelineSpan(span, "move", 3), { start: 103, end: 107 })
  assert.deepEqual(adjustTimelineSpan(span, "start", 2), { start: 102, end: 104 })
  assert.deepEqual(adjustTimelineSpan(span, "start", 8), { start: 104, end: 104 })
  assert.deepEqual(adjustTimelineSpan(span, "end", -8), { start: 100, end: 100 })
})

test("timeline omits undated placeholders without changing recorded task dates", () => {
  const rows = [
    { id: "undated", startDate: null, endDate: null },
    { id: "range", startDate: "2026-07-13", endDate: "2026-07-17" },
    { id: "milestone", startDate: null, endDate: "2026-11-09" },
  ]
  assert.deepEqual(datedTimelineEntries(rows), [rows[1], rows[2]])
  assert.equal(rows.length, 3, "undated tasks remain available for editing in the table")
})
