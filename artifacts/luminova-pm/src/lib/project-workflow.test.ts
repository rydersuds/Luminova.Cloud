import assert from "node:assert/strict"
import test from "node:test"
import { projectTabFromSearch } from "./project-workflow.ts"

test("a closed schedule sends stale board links to the project overview", () => {
  assert.equal(projectTabFromSearch("?tab=board", false), "overview")
  assert.equal(projectTabFromSearch("?tab=overview", false), "overview")
  assert.equal(projectTabFromSearch("?tab=board", true), "board")
})
