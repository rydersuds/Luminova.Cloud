import { expect, test, type Page } from '@playwright/test';

const invoices = [
  {
    id: 'invoice-1',
    invoiceNumber: 'CLIENT-100',
    projectId: 'project-1',
    projectName: 'Riverstone Residence',
    vendor: 'Avery & Morgan Reid',
    direction: 'luminova_to_client',
    clientName: 'Avery & Morgan Reid',
    clientLogoUrl: '/broken-client-logo.svg',
    amount: 250000,
    date: '2026-09-01',
    status: 'Approved',
    lineItem: 'Progress billing',
    overage: 0,
  },
  {
    id: 'invoice-2',
    invoiceNumber: 'VENDOR-200',
    projectId: 'project-1',
    projectName: 'Riverstone Residence',
    vendor: 'Northline Electric',
    direction: 'company_to_luminova',
    clientName: null,
    clientLogoUrl: null,
    amount: 85000,
    date: '2026-09-02',
    status: 'Pending',
    lineItem: 'Electrical',
    overage: 0,
  },
];

async function loadFinancials(page: Page, summary: object) {
  await page.route('**/api/invoices/summary', (route) => route.fulfill({ json: summary }));
  await page.route('**/api/invoices**', (route) => {
    if (route.request().url().endsWith('/summary')) return route.fallback();
    return route.fulfill({ json: invoices });
  });
  await page.goto('/__visual/financials');
}

test('renders portfolio totals above the existing invoice intake workflow', async ({ page }) => {
  await loadFinancials(page, {
    invoicedRevenue: 1250000,
    invoicedExpenses: 485000,
    acceptedClientQuoteValue: 2000000,
    upcomingClientPayments: 750000,
  });

  const summary = page.getByRole('region', { name: 'Portfolio financial summary' });
  await expect(summary.getByText('$1,250,000')).toBeVisible();
  await expect(summary.getByText('$485,000')).toBeVisible();
  await expect(summary.getByText('$765,000')).toBeVisible();
  await expect(summary.getByText('$750,000')).toBeVisible();
  await expect(summary.getByText('$2,000,000.00 accepted client work')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoice intake queue' })).toBeVisible();
  await expect(page.getByText('CLIENT-100').last()).toBeVisible();
});

test('keeps client and vendor invoice identities distinct across responsive layouts', async ({ page }) => {
  await page.route('**/broken-client-logo.svg', (route) => route.fulfill({ status: 404, body: '' }));
  await loadFinancials(page, {
    invoicedRevenue: 250000,
    invoicedExpenses: 85000,
    acceptedClientQuoteValue: 500000,
    upcomingClientPayments: 250000,
  });

  await expect(page.getByText('Client invoice', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/Vendor invoice/)).toHaveCount(2);
  await expect(page.getByLabel('Avery & Morgan Reid initials')).toHaveCount(2);
  await expect(page.getByText('Northline Electric')).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'Northline Electric logo' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('CLIENT-100').first()).toBeVisible();
  await expect(page.getByLabel('Avery & Morgan Reid initials').first()).toBeVisible();
  await expect(page.getByText('Vendor invoice', { exact: true }).first()).toBeVisible();
});

test('renders real zero totals without treating them as unavailable', async ({ page }) => {
  await loadFinancials(page, {
    invoicedRevenue: 0,
    invoicedExpenses: 0,
    acceptedClientQuoteValue: 0,
    upcomingClientPayments: 0,
  });

  const summary = page.getByRole('region', { name: 'Portfolio financial summary' });
  await expect(summary.getByText('$0.00')).toHaveCount(5);
  await expect(page.getByText('Financial totals are unavailable')).toHaveCount(0);
});

test('keeps invoice intake available when the summary fails and retries it', async ({ page }) => {
  let available = false;
  await page.route('**/api/invoices/summary', (route) => {
    if (!available) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    return route.fulfill({
      json: {
        invoicedRevenue: 100,
        invoicedExpenses: 50,
        acceptedClientQuoteValue: 250,
        upcomingClientPayments: 150,
      },
    });
  });
  await page.route('**/api/invoices**', (route) => {
    if (route.request().url().endsWith('/summary')) return route.fallback();
    return route.fulfill({ json: invoices });
  });
  await page.goto('/__visual/financials');

  await expect(page.getByText('Financial totals are unavailable')).toBeVisible();
  await expect(page.getByText('CLIENT-100').last()).toBeVisible();
  available = true;
  await page.getByRole('button', { name: 'Retry totals' }).click();
  await expect(page.getByText('$150')).toBeVisible();
});