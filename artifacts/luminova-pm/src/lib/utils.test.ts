import assert from "node:assert/strict"
import test from "node:test"
import { formatDateOnly } from "./utils.ts"

test("formatDateOnly preserves the calendar day west of UTC", () => {
  assert.equal(formatDateOnly("2026-09-12"), "Sep 12, 2026")
})