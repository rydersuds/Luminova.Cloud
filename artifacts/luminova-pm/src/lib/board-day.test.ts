import assert from "node:assert/strict"
import test from "node:test"
import { itemsForDay, parseDay } from "../components/board/board-model.ts"

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
