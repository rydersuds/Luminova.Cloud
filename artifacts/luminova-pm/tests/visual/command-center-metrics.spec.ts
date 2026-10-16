import { expect, test, type Page } from '@playwright/test';

const dashboard = {
  activeProjects: 3,
  awaitingApproval: 2,
  new360Photos: 4,
  budgetEnabledProjects: 3,
  budgeted: 100000,
  invoiced: 120000,
  recentActivity: [{
    id: 'activity-recorded', type: 'project', title: 'Schedule updated',
    description: 'A revised schedule was attached.', author: 'Project Manager', date: '2026-09-20T12:00:00Z',
  }],
};
const financials = {
  invoicedRevenue: 120000, invoicedExpenses: 85000,
  acceptedClientQuoteValue: 200000, upcomingClientPayments: 80000,
};

async function installWorkspace(page: Page) {
  await page.addInitScript(() => localStorage.setItem('luminova-cookie-consent-v1', 'accepted'));
  await page.route('**/api/users/me', route => route.fulfill({ json: { userId: 'user-admin', role: 'Admin' } }));
  await page.route('**/api/users/project-managers', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));
}

test('Command Center labels and amounts reflect their actual financial basis', async ({ page }) => {
  await installWorkspace(page);
  await page.route('**/api/dashboard/summary', route => route.fulfill({ json: dashboard }));
  await page.route('**/api/invoices/summary', route => route.fulfill({ json: financials }));
  await page.goto('/__visual/dashboard-cards');

  await expect(page.getByRole('region', { name: 'Operational summary' })).toHaveCount(0);
  await expect(page.locator('[data-testid^="readout-"]')).toHaveCount(0);

  const overview = page.getByRole('region', { name: 'Financial overview' });
  for (const [label, amount] of [
    ['Invoiced Revenue', '$120,000'],
    ['Recorded Internal Costs', '$85,000'],
    ['Recorded Margin', '$35,000'],
    ['Internal Cost Budget', '$100,000'],
    ['Client Quote Value', '$200,000'],
    ['Unbilled Client Work', '$80,000'],
  ]) {
    await expect(overview.locator('.ledger-cell').filter({ has: page.getByText(label, { exact: true }) })).toContainText(amount);
  }
  await expect(overview).not.toContainText('Projected Profit');
  await expect(overview).not.toContainText('Upcoming Client Payments');
  await expect(page.getByText('Schedule updated', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View projects', exact: true })).toHaveAttribute('href', '/projects');
});

test('Command Center stacks financial figures when space is tight', async ({ page }) => {
  await installWorkspace(page);
  await page.route('**/api/dashboard/summary', route => route.fulfill({ json: dashboard }));
  await page.route('**/api/invoices/summary', route => route.fulfill({
    json: { ...financials, invoicedRevenue: 1250000000 },
  }));
  await page.goto('/__visual/dashboard-cards');

  const overview = page.getByRole('region', { name: 'Financial overview' });
  const amount = overview.getByText('$1,250,000,000.00', { exact: true });
  await expect(amount).toBeVisible();
  for (const width of [1000, 700, 390, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => overview.evaluate(element => {
      const amounts = Array.from(element.querySelectorAll('[data-financial-amount]'));
      const minimum = Math.max(50, ...amounts.map(amount => Math.ceil(amount.getBoundingClientRect().width) + 50));
      const canFitTwo = element.clientWidth >= minimum * 2 + 1;
      const columns = getComputedStyle(element).gridTemplateColumns.split(' ').length;
      return columns === (canFitTwo ? 2 : 1) && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    expect(await amount.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.route('**/api/invoices/summary', route => route.fulfill({
    json: { ...financials, invoicedRevenue: 100, invoicedExpenses: 50, upcomingClientPayments: 100 },
  }));
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.reload();
  await expect(overview.getByText('$100.00', { exact: true })).toHaveCount(2);
  await expect.poll(() => overview.evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length,
  )).toBe(2);
});

test('Command Center keeps verified zero financial totals visible', async ({ page }) => {
  await installWorkspace(page);
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: { ...dashboard, activeProjects: 0, awaitingApproval: 0, new360Photos: 0, budgetEnabledProjects: 0, budgeted: 0, invoiced: 0, recentActivity: [] },
  }));
  await page.route('**/api/invoices/summary', route => route.fulfill({
    json: { invoicedRevenue: 0, invoicedExpenses: 0, acceptedClientQuoteValue: 0, upcomingClientPayments: 0 },
  }));
  await page.goto('/__visual/dashboard-cards');
  await expect(page.getByRole('region', { name: 'Financial overview' }).getByText('$0.00', { exact: true })).toHaveCount(5);
  await expect(page.getByText('No recorded project activity yet.', { exact: true })).toBeVisible();
});

test('failed Command Center totals stay explicit and recover through retry', async ({ page }) => {
  await installWorkspace(page);
  let available = false;
  await page.route('**/api/dashboard/summary', route => route.fulfill(
    available ? { json: dashboard } : { status: 503, json: { error: 'Unavailable' } },
  ));
  await page.route('**/api/invoices/summary', route => route.fulfill(
    available ? { json: financials } : { status: 503, json: { error: 'Unavailable' } },
  ));
  await page.goto('/__visual/dashboard-cards');
  await expect(page.getByText('Dashboard metrics and activity are unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Financial overview' }).locator('.ledger-cell').filter({ has: page.getByText('Internal Cost Budget', { exact: true }) })).toContainText('Unavailable');
  await expect(page.getByText('Financial totals are unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Financial overview' })).not.toContainText('$NaN');
  available = true;
  await page.getByRole('button', { name: 'Retry dashboard metrics' }).click();
  await page.getByRole('button', { name: 'Retry financial totals' }).click();
  await expect(page.getByRole('region', { name: 'Financial overview' }).locator('.ledger-cell').filter({ has: page.getByText('Internal Cost Budget', { exact: true }) })).toContainText('$100,000');
  await expect(page.getByRole('region', { name: 'Financial overview' })).toContainText('$120,000');
  await expect(page.getByText('Dashboard metrics and activity are unavailable.', { exact: true })).toHaveCount(0);
});
test('Command Center metric definitions open from Details', async ({ page }) => {
  await installWorkspace(page);
  await page.route('**/api/dashboard/summary', route => route.fulfill({ json: dashboard }));
  await page.route('**/api/invoices/summary', route => route.fulfill({ json: financials }));
  await page.goto('/__visual/dashboard-cards');
  const grid = page.getByLabel('Financial overview');
  await grid.getByText('Details').first().click();
  await expect(grid.getByText('Client invoices issued; not payments received.')).toBeVisible();
});
