import { expect, test, type Page } from '@playwright/test';

const projects = [{ id: 'purchase-project', name: 'Drywall Budget Project', budgetEnabled: true, categories: [
  { id: 'drywall', code: '09 29 00', description: 'Drywall', budgeted: 1000, used: 200, remaining: 800, canAutoApprove: true },
] }];
const file = { name: 'vendor-invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nInvoice\n%%EOF') };

async function fixture(page: Page, options: { role?: string; uncertain?: boolean; rejected?: boolean; search?: string; disabled?: boolean } = {}) {
  const records: Record<string, any>[] = [];
  const requests: Record<string, any>[] = [];
  let uploads = 0, puts = 0;
  let remaining = 800;
  await page.addInitScript(() => localStorage.setItem('luminova-cookie-consent-v1', 'accepted'));
  await page.route('**/api/users/me', route => route.fulfill({ json: { userId: 'assigned-pm', role: options.role ?? 'Project Manager' } }));
  await page.route('**/api/invoices', route => route.fulfill({ json: [] }));
  await page.route('**/api/invoice-projects', route => route.fulfill({ json: [{
    ...projects[0],
    budgetEnabled: !options.disabled,
    categories: options.disabled ? [] : [{ ...projects[0].categories[0], remaining, used: 1000 - remaining }],
  }] }));
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
      const known = !options.disabled && data.budgetLineItemId === 'drywall';
      const fits = known && data.amount <= remaining;
      invoice = {
        ...data, id: `purchase-${data.submissionId}`, projectName: projects[0].name, direction: 'company_to_luminova',
        submittedById: 'assigned-pm', status: fits ? 'Auto-approved' : 'Pending approval',
        approvalReason: options.disabled ? 'external_authorization_required' : known ? (fits ? 'within_budget' : 'over_budget') : 'budget_unavailable',
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
  await page.goto(`/__visual/financials${options.search ?? ''}`);
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

test('disabled project invoices remain pending for external authorization without a trade check', async ({ page }) => {
  const state = await fixture(page, { disabled: true });
  await page.getByTestId('button-open-submit-invoice').click();
  await page.getByTestId('select-invoice-project').selectOption('purchase-project');
  await expect(page.getByTestId('select-invoice-category')).toHaveValue('__none__');
  await expect(page.getByTestId('text-no-budget')).toContainText('authorization outside the app');
  await page.getByTestId('input-invoice-line-item').fill('Specialty materials');
  await page.getByTestId('input-invoice-file').setInputFiles(file);
  await page.getByTestId('input-invoice-number').fill('EXTERNAL-001');
  await page.getByTestId('input-invoice-date').fill('2026-10-02');
  await page.getByTestId('input-invoice-vendor').fill('External Vendor');
  await page.getByTestId('input-invoice-amount').fill('1200');
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Pending approval');
  await expect(page.getByTestId('panel-submit-result')).toContainText('Contact leadership outside this app');
  expect(state.requests[0].budgetLineItemId).toBeNull();
  expect(state.records[0].approvalReason).toBe('external_authorization_required');
});

test('approval cards explain external authorization and have no in-app decision buttons', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('luminova-cookie-consent-v1', 'accepted'));
  await page.route('**/api/users/me', route => route.fulfill({ json: { userId: 'admin', role: 'Admin' } }));
  await page.route('**/api/purchase-approvals**', route => route.fulfill({ json: [{
    id: 'external-approval', projectId: 'purchase-project', projectName: 'Drywall Budget Project',
    kind: 'invoice', invoiceId: 'external-invoice', budgetLineItemId: null,
    tradeLabel: 'External authorization required', vendor: 'External Vendor',
    description: 'Specialty materials', amount: 1200, remainingBefore: null, overage: 0,
    status: 'Pending approval', approvalReason: 'external_authorization_required',
    requestedById: 'pm', requestedByName: 'Project Manager', requestedAt: '2026-10-14T12:00:00.000Z',
    decidedByName: null, decidedAt: null, decisionNote: null, budgetIncrease: null,
  }] }));
  await page.route('**/api/invoice-projects', route => route.fulfill({ json: [{
    id: 'purchase-project', name: 'Drywall Budget Project', budgetEnabled: false, categories: [],
  }] }));
  await page.goto('/__visual/approvals');
  await expect(page.getByText('External authorization required').first()).toBeVisible();
  const externalCard = page.getByRole('article', { name: 'External authorization required for Drywall Budget Project' });
  await expect(externalCard).toContainText('Contact leadership outside the app for authorization');
  await expect(externalCard.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(externalCard.getByRole('button', { name: 'Decline' })).toHaveCount(0);
});

test('Field Team does not receive invoice submission controls', async ({ page }) => {
  await fixture(page, { role: 'Field Team' });
  await expect(page.getByRole('heading', { name: 'Invoices & Purchases' })).toBeVisible();
  await expect(page.getByTestId('button-open-submit-invoice')).toHaveCount(0);
});

test('project shortcut opens a preselected upload, limits records, and returns to the project budget', async ({ page }) => {
  const state = await fixture(page, { search: '?projectId=purchase-project&submit=1' });
  await expect(page.getByTestId('form-invoice-upload')).toBeVisible();
  await expect(page.getByTestId('select-invoice-project')).toHaveValue('purchase-project');
  await expect(page).not.toHaveURL(/submit=1/);
  await page.getByTestId('select-invoice-category').selectOption('drywall');
  await page.getByTestId('input-invoice-file').setInputFiles(file);
  await page.getByTestId('input-invoice-number').fill('PROJECT-001');
  await page.getByTestId('input-invoice-date').fill('2026-10-02');
  await page.getByTestId('input-invoice-vendor').fill('Drywall Vendor');
  await page.getByTestId('input-invoice-amount').fill('100');
  await page.getByTestId('button-submit-invoice').click();
  await expect(page.getByTestId('panel-submit-result')).toContainText('Auto-approved');
  expect(state.requests[0].projectId).toBe('purchase-project');
  state.records.push({ ...state.records[0], id: 'other-invoice', projectId: 'other-project', projectName: 'Other Project', invoiceNumber: 'OTHER-PROJECT-001' });
  await page.reload();
  await expect(page.getByText('PROJECT-001', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('OTHER-PROJECT-001', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to project budget' })).toHaveAttribute('href', '/projects/purchase-project?tab=budget');
  await page.getByRole('button', { name: 'View all projects' }).click();
  await expect(page.getByText('OTHER-PROJECT-001', { exact: true }).last()).toBeVisible();
});