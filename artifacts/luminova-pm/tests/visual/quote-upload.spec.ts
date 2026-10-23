import { test, expect, type Page } from "@playwright/test";

const file = { name: "glass-quote.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nVendor Quote\n%%EOF") };
const draft = {
  vendorName: "Glass Vendor", vendorId: "v1", quoteNumber: "AI-100", trade: "Glazing",
  issueDate: "2026-10-01", dueDate: "2026-10-31", notes: "AI scope", documentTotal: 2500,
  unresolved: [], lineItems: [{ description: "Glass", quantity: 2, unitPrice: 10 }],
};
async function fixture(page: Page, options: { aiFailure?: boolean; unresolved?: boolean; uncertain?: boolean; delayed?: boolean } = {}) {
  const records: any[] = [], confirmations: any[] = [], cancellations: string[] = [];
  let uploads = 0, puts = 0, analyses = 0;
  let release: (() => void) | undefined;
  const waiting = new Promise<void>(resolve => { release = resolve });
  await page.route("**/api/projects**", route => route.fulfill({ json: [{ id: "p1", name: "Quote Project" }, { id: "p2", name: "Second Project" }] }));
  await page.route("**/api/trades**", route => route.fulfill({ json: [{ id: "v1", companyName: "Glass Vendor", tradeType: "Glass" }] }));
  await page.route("**/api/vendor-quotes**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/source")) return route.fulfill({ body: file.buffer, contentType: "application/pdf" });
    if (route.request().method() === "PATCH") {
      const updated = { ...records[0], ...route.request().postDataJSON(), attachments: records[0].attachments };
      records[0] = updated; return route.fulfill({ json: updated });
    }
    return route.fulfill({ json: records });
  });
  await page.route("**/api/vendor-quote-uploads**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "DELETE") {
      cancellations.push(path); return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/content")) { puts++; return route.fulfill({ status: 204 }); }
    if (path.endsWith("/draft")) {
      analyses++;
      if (options.delayed && analyses === 1) await waiting;
      return options.aiFailure
        ? route.fulfill({ status: 422, json: { error: "AI analysis unavailable; source retained." } })
        : route.fulfill({ json: options.unresolved ? {
          ...draft, vendorName: "Unknown Glass", vendorId: null, issueDate: null, dueDate: null,
          unresolved: ["Vendor not uniquely matched", "Issue date missing", "Due date missing"],
        } : draft });
    }
    if (path.endsWith("/confirm")) {
      const input = route.request().postDataJSON();
      confirmations.push(input);
      const quote = {
        ...input, id: "uploaded-q1", projectName: "Quote Project", vendorName: "Glass Vendor",
        total: input.lineItems.reduce((sum: number, line: any) => sum + Math.round(line.quantity * Math.round(line.unitPrice * 100)), 0) / 100,
        attachments: [{ id: "source1", name: file.name, relativePath: `Uploaded quotes/${file.name}`, url: "/api/vendor-quotes/uploaded-q1/source", contentType: file.mimeType, size: file.buffer.length }],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      records[0] = quote;
      if (options.uncertain && confirmations.length === 1) return route.fulfill({ status: 503, json: { error: "Connection interrupted" } });
      return route.fulfill({ status: 201, json: quote });
    }
    uploads++;
    return route.fulfill({ status: 201, json: { id: `00000000-0000-4000-a000-${String(uploads).padStart(12, "0")}` } });
  });
  await page.goto("/__visual/quotes?projectId=p1");
  return { records, confirmations, cancellations, release: () => release!(), counts: () => ({ uploads, puts, analyses }) };
}
async function choose(page: Page) {
  await page.getByLabel("Choose quote to upload with AI", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue("p1");
  await page.getByRole("button", { name: "Upload and analyze" }).click();
}
async function manual(page: Page) {
  await page.getByLabel("Vendor / company").selectOption("v1");
  await page.getByLabel("Quote number", { exact: true }).fill("MANUAL-1");
  await page.getByLabel("Trade", { exact: true }).fill("Custom Glazing");
  await page.getByLabel("Issue date").fill("2026-10-01");
  await page.getByLabel("Due date", { exact: true }).fill("2026-10-31");
  await page.getByLabel("Line 1 description").fill("Corrected glass");
  await page.getByLabel("Quantity", { exact: true }).fill("1.5");
  await page.getByLabel("Unit price ($)", { exact: true }).fill("10.01");
}

test("picked quote is reviewed, recalculated in cents, saved, reopened, edited, and source opens after reload", async ({ page }) => {
  const state = await fixture(page);
  await choose(page);
  await expect(page.getByLabel("Quote number", { exact: true })).toHaveValue("AI-100");
  await expect(page.getByRole("alert")).toContainText("Difference: $5.00");
  await manual(page);
  await expect(page.getByRole("dialog")).toContainText("$15.02");
  expect(state.confirmations).toHaveLength(0);
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(state.confirmations[0]).toMatchObject({ projectId: "p1", trade: "Custom Glazing", lineItems: [{ quantity: 1.5, unitPrice: 10.01 }] });
  await page.reload();
  await expect(page.getByText("MANUAL-1 · REV 1")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Trade", { exact: true })).toHaveValue("Custom Glazing");
  await page.getByLabel("Notes").fill("Reviewed after reload");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Notes")).toHaveValue("Reviewed after reload");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: `Open original: ${file.name}` }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/vendor-quotes\/uploaded-q1\/source/);
  expect(state.records[0].attachments).toHaveLength(1);
});

test("manual fallback retains source and uncertain saves retry identical details without another upload", async ({ page }) => {
  const state = await fixture(page, { aiFailure: true, uncertain: true });
  await choose(page);
  await expect(page.getByText(/AI analysis unavailable/)).toBeVisible();
  await manual(page);
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry same submission" })).toBeVisible();
  await expect(page.getByLabel("Notes")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Retry same submission" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(state.confirmations[0]).toEqual(state.confirmations[1]);
  expect(state.counts()).toMatchObject({ uploads: 1, puts: 1 });
});

test("late and retried AI results never replace edited fields; replacement and cancellation keep source identities separate", async ({ page }) => {
  const state = await fixture(page, { delayed: true });
  await choose(page);
  await expect(page.getByRole("button", { name: "Analyzing…" })).toBeVisible();
  await page.getByLabel("Notes").fill("Keep these user edits");
  state.release();
  await expect(page.getByText("Suggestions are ready.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Notes")).toHaveValue("Keep these user edits");
  await page.getByRole("button", { name: "Keep my edits" }).click();
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.getByText("Suggestions are ready.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Notes")).toHaveValue("Keep these user edits");
  await page.getByLabel("Choose vendor quote document").setInputFiles({ ...file, name: "replacement.pdf" });
  await page.getByRole("button", { name: "Upload and analyze" }).click();
  await expect.poll(() => state.counts().uploads).toBe(2);
  await expect(page.getByRole("button", { name: "Retry analysis" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(() => state.cancellations.length).toBeGreaterThanOrEqual(2);
  expect(state.confirmations).toHaveLength(0);
});

test("mobile drop and keyboard picker leave unknown vendors and missing dates unresolved", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { unresolved: true });
  await page.getByRole("region", { name: "Upload vendor quote with AI" }).dispatchEvent("drop", {
    dataTransfer: await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(["%PDF-1.4\nQuote\n%%EOF"], "dropped.pdf", { type: "application/pdf" }));
      return data;
    }),
  });
  await page.getByRole("button", { name: "Upload and analyze" }).click();
  await expect(page.getByText("Vendor not uniquely matched", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Vendor / company")).toHaveValue("");
  await expect(page.getByLabel("Issue date")).toHaveValue("");
  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  expect(state.confirmations).toHaveLength(0);
  await expect(page.getByRole("link", { name: /Manage vendor directory/ })).toHaveAttribute("href", "/trades");
  const replace = page.getByRole("button", { name: "Replace document" });
  await replace.scrollIntoViewIfNeeded();
  await expect(replace).toBeEnabled();
  await replace.focus();
  await expect(replace).toBeFocused();
  const [picker] = await Promise.all([page.waitForEvent("filechooser"), replace.press("Space")]);
  await picker.setFiles(file);
  await expect(page.getByRole("dialog")).toContainText(file.name);
  await page.screenshot({ path: "/tmp/quote-upload-mobile.png", fullPage: true });
});

test("unsupported, empty, and oversized files are rejected without requests", async ({ page }) => {
  const state = await fixture(page);
  const picker = page.getByLabel("Choose quote to upload with AI", { exact: true });
  await picker.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
  await expect(page.getByText("Document not supported", { exact: true })).toBeVisible();
  await picker.setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
  await picker.setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
  expect(state.counts().uploads).toBe(0);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
