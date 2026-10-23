import { expect, test, type Page } from "@playwright/test"

test.use({ hasTouch: true })

function fixture() {
  const units = [{ id: "suite-a", label: "101", unitTypeId: "one" }, { id: "suite-b", label: "PH 2", unitTypeId: "two" }]
  return {
    id: "project-1", name: "Suite project", budgetEnabled: true, unitBudgetEnabled: true, registerVersion: "fixture-version",
    allocationWarning: null as string | null,
    units,
    unitTypes: [
      { id: "one", name: "One bedroom", unitCount: 2, perUnitTotal: 150, total: 300 },
      { id: "two", name: "Two bedroom", unitCount: 1, perUnitTotal: 250, total: 250 },
    ],
    categories: units.flatMap((unit, i) => ["Drywall", "Paint"].map((trade, j) => ({
      id: `ub:${unit.id}:${trade.toLowerCase()}`, code: trade, description: trade,
      unitId: unit.id, unitLabel: unit.label, unitTypeName: i ? "Two bedroom" : "One bedroom",
      scopeKind: "suite", budgeted: (j ? 50 : i ? 200 : 100) as number | null,
      used: 20, remaining: (j ? 30 : i ? 180 : 80) as number | null, canAutoApprove: true,
    }))).concat([{
      id: "ub:shared:common", code: "Common areas", description: "Common areas", unitId: "shared:common",
      unitLabel: "Common areas", unitTypeName: "Shared area", scopeKind: "shared",
      budgeted: 300, used: 40, remaining: 260, canAutoApprove: true,
    }]),
  }
}

async function load(page: Page, project = fixture(), role = "Admin") {
  await page.route("**/api/users/me", route => route.fulfill({ json: { userId: "admin", role } }))
  await page.route("**/api/invoice-projects", route => route.fulfill({ json: [project] }))
  await page.goto("/__visual/trade-budgets")
}

test("expands categories with keyboard and touch while keeping shared budgets separate and fitting mobile", async ({ page }) => {
  await load(page)
  await expect(page.getByText(/2 registered suites of 3 source units/)).toBeVisible()
  const drywall = page.getByTestId("trade-unit-category").filter({ hasText: "Drywall" })
  await expect(drywall.getByText(/Registered-suite budget subtotal: \$300/)).toBeVisible()
  const toggle = drywall.locator("summary")
  await toggle.focus()
  await page.keyboard.press("Enter")
  await expect(drywall.getByText("Suite 101", { exact: true })).toBeVisible()
  await expect(drywall.getByText("Two bedroom", { exact: true })).toBeVisible()
  await expect(drywall.getByText("$200", { exact: true })).toBeVisible()
  await expect(drywall.getByText("$180", { exact: true })).toBeVisible()
  await page.keyboard.press("Space")
  await expect(drywall.getByText("Suite 101", { exact: true })).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await toggle.tap()
  await page.getByTestId("trade-unit-category").filter({ hasText: "Paint" }).locator("summary").click()
  await expect(drywall.getByText("Suite PH 2", { exact: true })).toBeVisible()
  await expect(page.getByTestId("trade-unit-breakdown").locator("details").filter({ has: page.getByRole("heading", { name: "Shared-area budgets", exact: true }) })).toContainText("$300")
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 320, height: 740 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByTestId("select-budget-scope")).toHaveCount(0)
})

test("keeps exact suite purchase selection and amounts, then refreshes after register save", async ({ page }) => {
  const project = fixture()
  await load(page, project)
  await page.getByRole("button", { name: "Check a purchase" }).click()
  await page.getByTestId("select-purchase-scope").selectOption("suite:suite-b")
  await page.getByLabel("Trade", { exact: true }).selectOption("ub:suite-b:drywall")
  await page.getByLabel("Amount (CAD, before tax)").fill("150")
  await expect(page.getByRole("status")).toContainText("$180 left")
  await expect(page.getByRole("status")).toContainText("$30 left after")
  let purchase: { projectId: string; budgetLineItemId: string; amount: number } | undefined
  await page.route("**/api/purchase-approvals", async route => {
    purchase = route.request().postDataJSON()
    return route.fulfill({ json: {
      id: "purchase", ...purchase, status: "Auto-approved", approvalReason: "within_budget",
      tradeLabel: "PH 2 · Drywall", remainingBefore: 180, overage: 0,
    } })
  })
  await page.getByRole("button", { name: "Record approved purchase" }).click()
  await expect(page.getByRole("heading", { name: "Purchase approved" })).toBeVisible()
  expect(purchase).toMatchObject({ projectId: "project-1", budgetLineItemId: "ub:suite-b:drywall", amount: 150 })
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await page.route("**/api/projects/project-1/budget-units", async route => {
    const body = route.request().postDataJSON()
    project.units = body.units
    project.categories = project.categories.map(category => category.unitId === "suite-a" ? { ...category, unitLabel: "Suite revised" } : category)
    return route.fulfill({ json: project })
  })
  await page.getByRole("button", { name: "Edit suites" }).click()
  await page.getByTestId("input-suite-label-suite-a").fill("Suite revised")
  await page.getByRole("button", { name: "Save suites" }).click()
  await expect(page.getByRole("button", { name: "Edit suites" })).toBeVisible()
  await page.getByTestId("trade-unit-category").filter({ hasText: "Drywall" }).locator("summary").click()
  await expect(page.getByRole("list", { name: "Drywall registered suites" }).getByText("Suite Suite revised", { exact: true })).toBeVisible()
})

test("identifies unknown limits and historical unallocated costs rather than verified zero usage", async ({ page }) => {
  const project = fixture()
  project.allocationWarning = "Historical unallocated costs have not been divided between units."
  project.categories.forEach(category => { category.remaining = null; category.canAutoApprove = false; category.used = 0 })
  project.categories[0].budgeted = null
  await load(page, project)
  await expect(page.getByRole("alert")).toContainText("Historical unallocated costs")
  const drywall = page.getByTestId("trade-unit-category").filter({ hasText: "Drywall" })
  await drywall.locator("summary").click()
  await expect(drywall).toContainText("Unverified — incomplete source limits")
  await expect(drywall.getByText("Recorded used (partial)")).toHaveCount(2)
  await expect(drywall).toContainText("Recorded costs are not a verified total")
})

test("explains missing registration and missing allocations without inventing allowances", async ({ page }) => {
  const project = fixture()
  project.units = []
  project.categories = project.categories.filter(category => category.scopeKind === "shared")
  await load(page, project)
  await expect(page.getByText(/No suites registered. Use Edit suites/)).toBeVisible()
  await expect(page.getByTestId("trade-unit-breakdown").locator("details").filter({ has: page.getByRole("heading", { name: "Shared-area budgets", exact: true }) })).toBeVisible()
  project.units = fixture().units
  await page.reload()
  await expect(page.getByText(/No source trade allocations are available/)).toBeVisible()
  project.categories = fixture().categories.filter(category => category.id !== "ub:suite-b:paint")
  await page.reload()
  const paint = page.getByTestId("trade-unit-category").filter({ hasText: "Paint" })
  await paint.locator("summary").click()
  await expect(paint).toContainText("No source trade allocation is available for this suite")
  await expect(paint).toContainText("Unknown")
})

test("retains legacy aggregate trade budgets and role restrictions", async ({ page }) => {
  const project = { ...fixture(), unitBudgetEnabled: false, units: [], unitTypes: [], categories: [{
    ...fixture().categories[0], id: "legacy", unitId: "", budgeted: 9000, used: 400, remaining: 8600,
  }] }
  await load(page, project)
  await expect(page.getByText("$400 used of $9,000 budget")).toBeVisible()
  await expect(page.getByTestId("trade-unit-breakdown")).toHaveCount(0)
  await page.route("**/api/users/me", route => route.fulfill({ json: { role: "Client" } }))
  await page.reload()
  await expect(page.getByRole("heading", { name: "Trade budgets" })).toHaveCount(0)
})

test("keeps the retry path when trade budgets fail to load", async ({ page }) => {
  await page.route("**/api/users/me", route => route.fulfill({ json: { userId: "pm", role: "Project Manager" } }))
  let available = false
  await page.route("**/api/invoice-projects", route => available
    ? route.fulfill({ json: [fixture()] })
    : route.fulfill({ status: 503, json: { error: "Unavailable" } }))
  await page.goto("/__visual/trade-budgets")
  await expect(page.getByRole("alert")).toContainText("Trade budgets couldn't be loaded", { timeout: 15000 })
  available = true
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByTestId("trade-unit-breakdown")).toBeVisible()
})
