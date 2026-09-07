import assert from "node:assert/strict"
import test from "node:test"
import { formatDateOnly } from "./utils.ts"
import { boundedTextSnippet, collectFolderCandidates, folderFileIssue, normalizeRelativePath, readBatchImportResponse } from "./project-folder-import.ts"

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

test("project folder validation accepts arbitrary, video, and extensionless files", () => {
  const candidates = [
    { name: "walkthrough.mp4", size: 2048, type: "video/mp4" },
    { name: "survey.las", size: 1024, type: "application/octet-stream" },
    { name: "SITE_NOTES", size: 512, type: "" },
  ] as File[]
  for (const file of candidates) {
    assert.equal(folderFileIssue(file, `Records/${file.name}`), null)
  }
})

test("project folder validation still rejects empty and unsafe files", () => {
  const emptyDocument = { name: "estimate.pdf", size: 0 } as File
  const validDocument = { name: "estimate.pdf", size: 1024 } as File
  assert.equal(folderFileIssue(emptyDocument, "Estimates/estimate.pdf"), "File must not be empty")
  assert.equal(folderFileIssue(validDocument, "../estimate.pdf"), "Unsafe relative path")
})

test("project folder collection rejects case-insensitive relative path collisions", () => {
  const first = { name: "walkthrough.mp4", size: 1024, type: "video/mp4", webkitRelativePath: "Records/walkthrough.mp4" } as File
  const duplicate = { name: "WALKTHROUGH.mp4", size: 1024, type: "video/mp4", webkitRelativePath: "records/WALKTHROUGH.mp4" } as File
  const result = collectFolderCandidates([first, duplicate])
  assert.deepEqual(result.accepted.map(({ relativePath }) => relativePath), ["Records/walkthrough.mp4"])
  assert.deepEqual(result.skipped, [{
    name: "records/WALKTHROUGH.mp4",
    reason: "Collides with another relative path",
  }])
})

test("browser text extraction remains limited to explicitly supported formats", async () => {
  const text = new File(["site notes"], "notes.txt", { type: "text/plain" })
  const video = new File(["binary"], "walkthrough.mp4", { type: "video/mp4" })
  const extensionless = new File(["opaque"], "README", { type: "text/plain" })
  assert.equal(await boundedTextSnippet(text), "site notes")
  assert.equal(await boundedTextSnippet(video), undefined)
  assert.equal(await boundedTextSnippet(extensionless), undefined)
})

test("batch import response reader accepts successful JSON", async () => {
  const body = await readBatchImportResponse<{ importId: string }>(
    new Response(JSON.stringify({ importId: "import-1" }), { headers: { "Content-Type": "application/json" } }),
    { operation: "Creating the import session" },
  )
  assert.equal(body.importId, "import-1")
})

test("batch import response reader preserves JSON API errors", async () => {
  await assert.rejects(
    readBatchImportResponse(
      new Response(JSON.stringify({ error: "Import session expired." }), { status: 409, headers: { "Content-Type": "application/json" } }),
      { operation: "Restoring the import session" },
    ),
    /Import session expired\./,
  )
})

test("batch import response reader distinguishes authentication from preview routing failures", async () => {
  await assert.rejects(
    readBatchImportResponse(
      new Response("<!doctype html><div id=\"root\"></div>", { status: 404, headers: { "Content-Type": "text/html" } }),
      { operation: "Creating the import session", requestPath: "/api/project-import-sessions" },
    ),
    (error: Error) =>
      error.message.includes("could not reach the API route at /api/project-import-sessions") &&
      error.message.includes("wrong service"),
  )
  await assert.rejects(
    readBatchImportResponse(
      new Response(null, { status: 401 }),
      { operation: "Creating the import session", requestPath: "/api/project-import-sessions" },
    ),
    (error: Error) => error.message.includes("requires authentication") && !error.message.includes("wrong service"),
  )
})

test("batch import response reader hides HTML and identifies size-limit files", async () => {
  await assert.rejects(
    readBatchImportResponse(
      new Response("<html><h1>Request Entity Too Large</h1></html>", { status: 413, headers: { "Content-Type": "text/html" } }),
      { operation: "Uploading", fileName: "Plans/site-plan.pdf", expectsJson: false },
    ),
    (error: Error) => error.message.includes("site-plan.pdf") && error.message.includes("external platform size limit") && !error.message.includes("<html>"),
  )
})

test("batch import response reader handles empty and malformed JSON without parser errors", async () => {
  await assert.rejects(
    readBatchImportResponse(new Response(null, { status: 502 }), { operation: "Building the imported project" }),
    (error: Error) => error.message.includes("Building the imported project") && !error.message.includes("Unexpected"),
  )
  await assert.rejects(
    readBatchImportResponse(
      new Response("{broken", { status: 502, headers: { "Content-Type": "application/json" } }),
      { operation: "Checking project build status" },
    ),
    (error: Error) => error.message.includes("unreadable response") && !error.message.includes("Unexpected"),
  )
})