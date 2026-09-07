import assert from "node:assert/strict"
import test from "node:test"
import { formatDateOnly } from "./utils.ts"
import { folderFileIssue, normalizeRelativePath } from "./project-folder-import.ts"

test("formatDateOnly preserves the calendar day west of UTC", () => {
  assert.equal(formatDateOnly("2026-09-12"), "Sep 12, 2026")
})

test("project folder paths remain relative and reject traversal or controls", () => {
  assert.equal(normalizeRelativePath("Estimate\\Electrical\\quote.pdf"), "Estimate/Electrical/quote.pdf")
  assert.equal(normalizeRelativePath("../quote.pdf"), null)
  assert.equal(normalizeRelativePath("/private/quote.pdf"), null)
  assert.equal(normalizeRelativePath("Estimate/\u0000quote.pdf"), null)
})

test("project documents larger than 200 MB pass folder validation", () => {
  const largeDocument = { name: "estimate.pdf", size: 500 * 1024 * 1024 } as File
  assert.equal(folderFileIssue(largeDocument, "Estimates/estimate.pdf"), null)
})

test("project folder validation still rejects empty, unsafe, and unsupported files", () => {
  const emptyDocument = { name: "estimate.pdf", size: 0 } as File
  const unsupportedDocument = { name: "estimate.exe", size: 1024 } as File
  const validDocument = { name: "estimate.pdf", size: 1024 } as File
  assert.equal(folderFileIssue(emptyDocument, "Estimates/estimate.pdf"), "File must not be empty")
  assert.equal(folderFileIssue(unsupportedDocument, "Estimates/estimate.exe"), "Unsupported file type")
  assert.equal(folderFileIssue(validDocument, "../estimate.pdf"), "Unsafe relative path")
})