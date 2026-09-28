import assert from "node:assert/strict"
import test from "node:test"
import { canPreloadPrimaryPages, isWorkspacePath } from "./page-preload.ts"

test("background preloading skips constrained connections and devices", () => {
  assert.equal(canPreloadPrimaryPages({ connection: { saveData: true } }), false)
  assert.equal(canPreloadPrimaryPages({ connection: { effectiveType: "2g" } }), false)
  assert.equal(canPreloadPrimaryPages({ connection: { downlink: 1.4 } }), false)
  assert.equal(canPreloadPrimaryPages({ deviceMemory: 1 }), false)
  assert.equal(canPreloadPrimaryPages({ hardwareConcurrency: 2 }), false)
})

test("background preloading remains available on an unconstrained environment", () => {
  assert.equal(canPreloadPrimaryPages({
    onLine: true,
    connection: { effectiveType: "4g", downlink: 10, rtt: 40 },
    deviceMemory: 8,
    hardwareConcurrency: 8,
  }), true)
})

test("workspace route matching handles detail routes and query strings", () => {
  assert.equal(isWorkspacePath("/"), true)
  assert.equal(isWorkspacePath("/projects/riverstone?tab=photos"), true)
  assert.equal(isWorkspacePath("/profile"), true)
  assert.equal(isWorkspacePath("/sign-in"), false)
  assert.equal(isWorkspacePath("/intro"), false)
})