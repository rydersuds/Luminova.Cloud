import { expect, test } from '@playwright/test';

test('opens the public demo without workspace API traffic and returns to sign-in', async ({ page }) => {
  const workspaceApiRequests: string[] = [];
  let trackingDemoRequests = false;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (trackingDemoRequests && url.origin === 'http://127.0.0.1:4173' && url.pathname.startsWith('/api/')) {
      workspaceApiRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  await page.goto('/');
  const demoLink = page.getByTestId('link-public-demo');
  await expect(demoLink).toBeVisible();

  trackingDemoRequests = true;
  await demoLink.click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByTestId('demo-workspace')).toBeVisible();
  await expect(page.getByText('SANDBOX', { exact: true })).toBeVisible();
  await expect(page.getByTestId('select-persona')).toBeVisible();
  await page.getByTestId('nav-project-riverstone').click();
  await page.getByTestId('select-project-health-riverstone').selectOption('At risk');
  await page.reload();
  await expect(page.getByTestId('demo-workspace')).toBeVisible();
  await page.getByTestId('nav-project-riverstone').click();
  await expect(page.getByTestId('select-project-health-riverstone')).toHaveValue('On track');
  expect(workspaceApiRequests).toEqual([]);

  trackingDemoRequests = false;
  await page.getByTestId('link-exit-demo').click();
  await expect(page.getByTestId('link-public-demo')).toBeVisible();
  await page.goto('/sign-in');
  await expect(page.getByText('Continue to secure sign in')).toBeVisible();
});

test('simulates project, panorama, schedule, quote, and invoice workflows, then resets them', async ({ page }) => {
  const workspaceApiRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173' && url.pathname.startsWith('/api/')) {
      workspaceApiRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  await page.goto('/demo');

  await page.getByTestId('input-global-search').fill('Northline Commons');
  await expect(page.getByTestId('search-result-0')).toContainText('Northline Commons');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('select-project-health-northline')).toBeVisible();

  await page.getByTestId('nav-projects').click();
  await page.getByTestId('button-sample-import').click();
  await expect(page.getByTestId('card-project-imported-sample')).toBeVisible();
  await page.getByTestId('button-new-project').click();
  await page.getByTestId('input-intake-project-name').fill('Aspen Ridge Residence');
  await page.getByTestId('input-intake-client').fill('Aspen Peak Group');
  await page.getByTestId('button-create-sample-project').click();
  await expect(page.locator('[data-testid^="card-project-sample-"]')).toContainText('Aspen Ridge Residence');
  await page.getByTestId('select-project-status').selectOption('Watch');
  await expect(page.getByTestId('text-project-count')).toHaveText('1 projects');
  await page.getByTestId('card-project-northline').click();
  await page.getByTestId('tab-project-board').click();
  await page.getByTestId('select-status-b4').selectOption('Done');
  await expect(page.getByTestId('select-status-b4')).toHaveValue('Done');

  await page.getByTestId('tab-project-photos-360s').click();
  await page.getByTestId('button-photo-filter-360-').click();
  await page.getByTestId('photo-card-p5').click();
  await expect(page.getByTestId('panorama-viewer')).toBeVisible();
  await page.getByTestId('button-panorama-right').click();
  await expect(page.getByTestId('text-panorama-heading')).toHaveText('Northeast · 45°');
  await page.getByTestId('button-close-dialog').click();

  await page.getByTestId('nav-schedule').click();
  await page.getByTestId('button-schedule-calendar').click();
  await expect(page.getByRole('heading', { name: 'June 2025' })).toBeVisible();
  await page.getByTestId('button-schedule-timeline').click();
  await expect(page.getByText('30-day lookahead', { exact: true })).toBeVisible();

  await page.getByTestId('nav-communications').click();
  await page.getByTestId('input-message-draft').fill('Sample coordination update for the morning huddle.');
  await page.getByTestId('button-send-message').click();
  await expect(page.getByText('Sample coordination update for the morning huddle.', { exact: true })).toBeVisible();

  await page.getByTestId('nav-users').click();
  await page.getByTestId('select-role-filter').selectOption('Client');
  await expect(page.getByTestId('user-row-u4')).toBeVisible();
  await page.getByTestId('button-preview-role-field').click();
  await expect(page.getByTestId('nav-financials')).toHaveCount(0);
  await page.getByTestId('select-persona').selectOption('Morgan Reyes');
  await page.getByTestId('button-open-profile').click();
  await expect(page.getByTestId('toggle-pref-weekly')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('toggle-pref-weekly').click();
  await expect(page.getByTestId('toggle-pref-weekly')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('nav-quotes').click();
  await page.getByTestId('select-quote-filter').selectOption('Review');
  await page.getByTestId('button-edit-quote-q1').click();
  await page.getByTestId('input-quote-amount-q1').fill('70000');
  await page.getByTestId('button-save-quote-edit-q1').click();
  await expect(page.getByTestId('quote-card-q1')).toContainText('$70,000');

  await page.getByTestId('nav-financials').click();
  await page.getByTestId('button-review-invoice-i1').click();
  await page.getByTestId('button-approve-invoice').click();
  await expect(page.getByTestId('invoice-row-i1')).toContainText('Approved');

  await page.getByTestId('button-reset-demo').click();
  await page.getByTestId('nav-financials').click();
  await expect(page.getByTestId('invoice-row-i1')).toContainText('Pending approval');
  expect(workspaceApiRequests).toEqual([]);
});
