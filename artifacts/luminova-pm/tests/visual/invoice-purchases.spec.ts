import { expect, test, type Page } from '@playwright/test';

const projects = [{ id: 'purchase-project', name: 'Drywall Budget Project', categories: [
  { id: 'drywall', code: '09 29 00', description: 'Drywall', budgeted: 1000, used: 200, remaining: 800, canAutoApprove: true },
] }];
const file = { name: 'vendor-invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nInvoice\n%%EOF') };

async function fixture(page: Page, options: { role?: string; uncertain?: boolean; rejected?: boolean } = {}) {
  const records: Record<string, any>[] = [];
  const requests: Record<string, any>[] = [];
  let uploads = 0, puts = 0;
  let remaining = 800;
  await page.addInitScript(() => localStorage.setItem('luminova-cookie-consent-v1', 'accepted'));
  await page.route('**/api/users/me', route => route.fulfill({ json: { userId: 'assigned-pm', role: options.role ?? 'Project Manager' } }));
  await page.route('**/api/invoices', route => route.fulfill({ json: [] }));
  await page.route('**/api/invoice-projects', route => route.fulfill({ json: [{ ...projects[0], categories: [
    { ...projects[0].categories[0], remaining, used: 1000 - remaining },
  ] }] }));
  await page.route('**/api/invoice-submissions', route => route.fulfill({ json: records }));
  await page.route('**/api/invoice-submissions/*/file', route => route.fulfill({
    body: file.buffer, contentType: 'application/pdf',
  }));
  await page.route('**/api/invoice-uploads', route => {
    const data = route.request().postDataJSON();
    expect(data).toMatchObject({ projectId: 'purchase-project', name: file.name, size: file.buffer.length, contentType: file.mimeType });
    uploads++;
    return route.fulfill({ json: { uploadURL: `https://invoice-upload.test/${uploads}`, objectPath: `/objects/test-upload-${uploads}` } });
  });
  await page.route('https://invoice-upload.test/**', route => {
    if (route.request().method() === 'PUT') puts++;
    return route.fulfill({ status: 200, body: '', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  });
  await page.unroute('**/api/invoices');
  await page.route('**/api/invoices', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    const data = route.request().postDataJSON();
    requests.push(data);
    if (options.rejected && requests.length === 1) return route.fulfill({ status: 400, json: { error: 'The invoice upload is expired. Upload it again.' } });
    let invoice = records.find(record => record.id === `purchase-${data.submissionId}`);
    if (!invoice) {
      const known = data.budgetLineItemId === 'drywall';
      const fits = known && data.amount <= remaining;
      invoice = {
        ...data, id: `purchase-${data.submissionId}`, projectName: projects[0].name, direction: 'company_to_luminova',
        submittedById: 'assigned-pm', status: fits ? 'Auto-approved' : 'Pending approval',
        approvalReason: known ? (fits ? 'within_budget' : 'over_budget') : 'budget_unavailable',
        overage: known ? Math.max(data.amount - remaining, 0) : 0,
        budgetRemainingBefore: known ? remaining : null, budgetRemainingAfter: known ? remaining - data.amount : null,
        attachment: { ...data.attachment, url: `/api/invoice-submissions/purchase-${data.submissionId}/file` },
      };
      records.push(invoice);
      if (known) remaining -= data.amount;
    }
    if (options.uncertain && requests.length === 1) return route.fulfill({ status: 503, json: { error: 'Temporary response failure' } });
    return route.fulfill({ status: 201, json: invoice });
  });
  await page.goto('/__visual/financials');
  return { records, requests, counts: () => ({ uploads, puts }) };
}

async function fill(page: Page, amount: string, number: string, category = 'drywall') {
  await page.getByTestId('button-open-submit-invoice').click();
  await page.getByTestId('select-invoice-project').selectOption('purchase-project');
  await page.getByTestId('select-invoice-category').selectOption(category);
  await page.getByTestId('input-invoice-file').setInputFiles(file);
  await page.getByTestId('input-invoice-number').fill(number);
  await page.getByTestId('input-invoice-date').fill('2026-10-02');
  await page.getByTestId('input-invoice-vendor').fill('Drywall Vendor');
  await page.getByTestId('input-invoice-amount').fill(amount);
}

test('PM uploads a purchase, sees approval and remaining budget, then sees leadership escalation', async ({ page }) => {
  const state = await fixture(page);
  await expect(page.getByRole('region', { name: 'Portfolio financial summary' })).toHaveCount(0);
  await fill(page, '600', 'DRYWALL-001');
  await expect(page.getByTestId('panel-budget-basis')).toContainText('$800.00');
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Auto-approved');
  expect(state.requests[0]).toMatchObject({
    projectId: 'purchase-project', budgetLineItemId: 'drywall', amount: 600,
    attachment: { objectPath: '/objects/test-upload-1', name: file.name },
  });
  expect(state.counts()).toEqual({ uploads: 1, puts: 1 });
  const downloadPromise = page.waitForEvent('download');
  await page.locator(`[data-testid="link-invoice-file-${state.records[0].id}"]:visible`).click();
  expect((await downloadPromise).suggestedFilename()).toBe(file.name);
  await fill(page, '250', 'DRYWALL-002');
  await expect(page.getByTestId('panel-budget-basis')).toContainText('$200.00');
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Pending approval');
  await expect(page.getByTestId('panel-submit-result')).toContainText('$50.00');
  await expect(page.getByTestId('panel-submit-result')).toContainText('Contact leadership outside this app');
  await expect(page.getByRole('button', { name: /^(Approve|Reject)$/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('DRYWALL-001', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('DRYWALL-002', { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: '/tmp/invoice-purchases-desktop.png', fullPage: true });
});

test('uncertain outcome locks fields and keeps exactly the same upload and submission on retry', async ({ page }) => {
  const state = await fixture(page, { uncertain: true });
  await fill(page, '600', 'RETRY-001');
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('button-submit-invoice')).toHaveText('Retry same submission');
  await expect(page.getByTestId('input-invoice-amount')).toBeDisabled();
  await expect(page.getByTestId('select-invoice-project')).toBeDisabled();
  await expect(page.getByTestId('input-invoice-file')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('form-invoice-upload')).toBeVisible();
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Auto-approved');
  expect(state.requests).toHaveLength(2);
  expect(state.requests[1]).toEqual(state.requests[0]);
  expect(state.records).toHaveLength(1);
  expect(state.counts()).toEqual({ uploads: 1, puts: 1 });
});

test('expired upload allows recovery without falsely declaring an uncertain purchase', async ({ page }) => {
  const state = await fixture(page, { rejected: true });
  await fill(page, '100', 'UPLOAD-001');
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('text-invoice-error')).toContainText('expired');
  await expect(page.getByTestId('input-invoice-amount')).toBeEnabled();
  await page.getByTestId('button-upload-again').click();
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Auto-approved');
  expect(state.counts()).toEqual({ uploads: 2, puts: 2 });
  expect(state.records).toHaveLength(1);
});

test('unmatched trade is not auto-approved and the upload dialog fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await fill(page, '100', 'UNKNOWN-001', '__none__');
  await page.getByTestId('input-invoice-line-item').fill('Unpriced specialty work');
  await expect(page.getByTestId('text-no-budget')).toContainText('never auto-approved');
  await page.getByTestId('button-submit-invoice').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/invoice-purchases-mobile.png' });
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Pending approval');
  await expect(page.getByTestId('panel-submit-result')).toContainText('Contact leadership outside this app');
});

test('Field Team does not receive invoice submission controls', async ({ page }) => {
  await fixture(page, { role: 'Field Team' });
  await expect(page.getByRole('heading', { name: 'Invoices & Purchases' })).toBeVisible();
  await expect(page.getByTestId('button-open-submit-invoice')).toHaveCount(0);
});