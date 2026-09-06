import assert from "node:assert/strict"
import test from "node:test"
import { formatDateOnly } from "./utils.ts"
import { folderFileIssue, MAX_PROJECT_DOCUMENT_BYTES, normalizeRelativePath } from "./project-folder-import.ts"

test("formatDateOnly preserves the calendar day west of UTC", () => {
  assert.equal(formatDateOnly("2026-09-12"), "Sep 12, 2026")
})

test("project folder paths remain relative and reject traversal or controls", () => {
  assert.equal(normalizeRelativePath("Estimate\\Electrical\\quote.pdf"), "Estimate/Electrical/quote.pdf")
  assert.equal(normalizeRelativePath("../quote.pdf"), null)
  assert.equal(normalizeRelativePath("/private/quote.pdf"), null)
  assert.equal(normalizeRelativePath("Estimate/\u0000quote.pdf"), null)
})

test("project documents allow exactly 200 MB but reject larger files", () => {
  const atLimit = { name: "estimate.pdf", size: MAX_PROJECT_DOCUMENT_BYTES } as File
  const tooLarge = { name: "estimate.pdf", size: MAX_PROJECT_DOCUMENT_BYTES + 1 } as File
  assert.equal(folderFileIssue(atLimit, "Estimates/estimate.pdf"), null)
  assert.equal(folderFileIssue(tooLarge, "Estimates/estimate.pdf"), "Exceeds 200 MB per-file limit")
})