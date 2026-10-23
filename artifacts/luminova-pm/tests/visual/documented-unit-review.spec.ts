import { expect, test } from "@playwright/test"

test("document review preserves manual edits and IDs, requires missing mappings, deduplicates retries and retains a stale draft", async ({ page }) => {
  const project = {
    id: "project-1", name: "Documented suites", budgetEnabled: true, unitBudgetEnabled: true,
    registerVersion: "register-v1",
    units: [{ id: "existing-id", label: "001", unitTypeId: "one" }],
    unitTypes: [{ id: "one", name: "1 Bedroom", unitCount: 4, perUnitTotal: 100, total: 400 }],
    categories: [],
  }
  await page.route("**/api/users/me", route => route.fulfill({ json: { userId: "admin", role: "Admin" } }))
  await page.route("**/api/invoice-projects", route => route.fulfill({ json: [project] }))
  let extractionCount = 0
  await page.route("**/api/projects/project-1/documented-units", route => {
    extractionCount++
    return route.fulfill({ json: {
      complete: false,
      candidates: ["001", "002"].map(label => ({
        label, unitTypeId: null, uncertain: true,
        evidence: [{ documentId: "source", sourcePath: "Building 79/RebuildREV1.pdf", page: 5, text: "Floor Plan (Units 001, 002)", method: "text" }],
      })),
      sources: [{ documentId: "source", sourcePath: "Building 79/RebuildREV1.pdf", pageCount: 36, pagesRead: 36, status: "partial" }],
      warnings: ["Review is incomplete; no supported dwelling-type mapping."],
    } })
  })
  let saved: { units: typeof project.units; baseVersion: string } | undefined
  await page.route("**/api/projects/project-1/budget-units", async route => {
    saved = route.request().postDataJSON()
    await route.fulfill({ status: 409, json: { error: "The saved suite register changed. Your edits are still here." } })
  })
  await page.goto("/__visual/trade-budgets")
  await page.getByTestId("button-edit-suites").click()
  await page.getByTestId("button-add-suite-one").click()
  await page.getByPlaceholder("Suite label").last().fill("manual-009")
  await page.getByTestId("button-find-document-units").click()
  await expect(page.getByTestId("document-unit-results")).toContainText("2 documented labels found")
  await expect(page.getByLabel("Select suite 001", { exact: true })).toBeDisabled()
  await page.getByLabel("Select suite 002", { exact: true }).check()
  await expect(page.getByTestId("button-add-documented-units")).toBeDisabled()
  await page.getByLabel("Dwelling type for suite 002").selectOption("one")
  const evidence = page.getByTestId("document-unit-results").locator("details").filter({ hasText: "Source evidence" }).last()
  await evidence.locator("summary").click()
  await expect(evidence).toContainText("page 5")
  await expect(evidence).toContainText("Floor Plan (Units 001, 002)")
  await page.getByTestId("button-add-documented-units").click()
  await expect(page.getByPlaceholder("Suite label")).toHaveCount(3)
  await expect(page.getByPlaceholder("Suite label").nth(1)).toHaveValue("manual-009")
  await page.getByTestId("button-find-document-units").click()
  await expect.poll(() => extractionCount).toBe(2)
  await expect(page.getByLabel("Select suite 002", { exact: true })).toBeDisabled()
  await expect(page.getByPlaceholder("Suite label")).toHaveCount(3)
  await page.getByTestId("button-save-suites").click()
  await expect(page.getByTestId("text-suite-error")).toContainText("Your edits are still here")
  expect(saved?.baseVersion).toBe("register-v1")
  expect(saved?.units).toEqual([
    { id: "existing-id", label: "001", unitTypeId: "one" },
    { id: expect.any(String), label: "manual-009", unitTypeId: "one" },
    { id: expect.any(String), label: "002", unitTypeId: "one" },
  ])
  await expect(page.getByPlaceholder("Suite label").nth(1)).toHaveValue("manual-009")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
