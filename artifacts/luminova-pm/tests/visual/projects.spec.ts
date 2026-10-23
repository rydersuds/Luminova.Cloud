import { expect, test, type Page } from '@playwright/test';

const makeProject = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'project-calgary',
  name: 'Calgary Tower Renewal',
  address: '101 Centre Street',
  region: 'Calgary',
  status: 'Active',
  clientName: 'Luminova Client',
  pmName: 'Morgan Reyes',
  targetDate: '2026-12-15',
  budgeted: 1_000_000,
  budgetEnabled: true,
  progress: 35,
  ...overrides,
});

const sourceFiles = [
  {
    id: 'invoice-workbook',
    name: 'Framing invoice.xlsx',
    classification: 'invoice',
    collection: 'Invoices',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    url: '/__source-files/invoice.xlsx',
  },
  {
    id: 'quote-pdf',
    name: 'Electrical quote.pdf',
    classification: 'quote',
    collection: 'Quotes',
    contentType: 'application/pdf',
    url: '/__source-files/quote.pdf',
  },
];

async function openProjectFinancials(page: Page, files: object[] = sourceFiles) {
  await page.addInitScript(() => localStorage.setItem('luminova-cookie-consent-v1', 'accepted'));
  await page.route('**/api/users/me', route => route.fulfill({
    json: { userId: 'user-pm', role: 'Project Manager' },
  }));
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', route => route.fulfill({
    json: makeProject({
      id: 'riverstone', budgetEnabled: false, files, photos: [], panoramas: [],
      invoices: [], trades: [], lineItems: [], scheduleImages: [],
      startDate: '2026-01-01', description: '', exteriorImage: '',
      clientQuote: { total: 0, revision: '', portions: [] },
    }),
  }));
  await page.route('**/api/projects/riverstone/documents/invoice-workbook/preview', route => route.fulfill({
    json: {
      kind: 'excel', text: null, truncated: false,
      worksheets: [{ name: 'Summary', rows: [['Trade', 'Amount'], ['Framing', '1250']] }],
    },
  }));
  await page.context().route('**/__source-files/quote.pdf', route => route.fulfill({
    contentType: 'text/plain', body: 'Original quote document',
  }));
  await page.goto('/__visual/project-panorama?tab=budget');
}

test.describe('Project Source Files disclosure', () => {
  for (const width of [1280, 390]) {
    test(`collapses and restores document actions at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openProjectFinancials(page);
      const toggle = page.getByRole('button', { name: /Source Files$/ });
      const preview = page.getByRole('button', { name: 'Preview Framing invoice.xlsx' });
      const open = page.getByRole('link', { name: 'Open Electrical quote.pdf' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const contentId = await toggle.getAttribute('aria-controls');
      expect(contentId).toBeTruthy();
      const content = page.locator(`[id="${contentId}"]`);
      await expect(content).toBeVisible();
      await expect(preview).toBeVisible();
      await expect(open).toBeVisible();
      await expect(toggle.locator('svg')).not.toHaveClass(/-rotate-90/);
      expect(await toggle.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle.locator('svg')).toHaveClass(/-rotate-90/);
      await expect(page.getByRole('heading', { name: /Source Files/ })).toBeVisible();
      await expect(content).toBeHidden();
      await expect(preview).toHaveCount(0);
      await expect(open).toHaveCount(0);
      await page.keyboard.press('Tab');
      await expect(toggle).not.toBeFocused();
      expect(await page.evaluate(id => document.getElementById(id!)?.contains(document.activeElement), contentId)).toBe(false);

      // Tab changes unmount the panel, but not the user's disclosure choice.
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      await page.getByRole('tab', { name: 'Budget', exact: true }).click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(preview).toBeVisible();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(open).toHaveAttribute('href', sourceFiles[1].url);
      await expect(open).toHaveAttribute('target', '_blank');
      const reopenedContentId = await toggle.getAttribute('aria-controls');
      const reopenedContent = page.locator(`[id="${reopenedContentId}"]`);
      expect(await reopenedContent.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

      await preview.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('table', { name: 'Worksheet Summary' })).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Download original Framing invoice.xlsx' }))
        .toHaveAttribute('href', sourceFiles[0].url);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      const popupPromise = page.waitForEvent('popup');
      await open.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      await expect(popup.locator('body')).toContainText('Original quote document');
      await popup.close();
      await page.reload();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  }

  for (const files of [[], [{ ...sourceFiles[1], classification: 'contract' }]]) {
    test(`omits the section with ${files.length ? 'only unrelated files' : 'no files'}`, async ({ page }) => {
      await openProjectFinancials(page, files);
      await expect(page.getByRole('tab', { name: 'Budget', exact: true })).toHaveAttribute('data-state', 'active');
      await expect(page.getByRole('heading', { name: 'Calgary Tower Renewal' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Source Files' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Source Files$/ })).toHaveCount(0);
    });
  }
});

test('project cards omit budget figures when internal budgeting is disabled', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('luminova-cookie-consent-v1', 'accepted'));
  await page.route('**/api/projects**', route => route.fulfill({
    json: [makeProject({ id: 'disabled-budget-project', name: 'Externally Authorized Project', budgetEnabled: false })],
  }));
  await page.goto('/__visual/project-cards');
  const card = page.getByRole('link', { name: 'Open Externally Authorized Project' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Budget', { exact: true })).toHaveCount(0);
  await expect(card).toContainText('Luminova Client');
});

test.describe('All Projects region filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
    });
  });

  test('keeps complete, unique region options while filters narrow the project cards', async ({ page }) => {
    const allProjects = [
      makeProject(),
      makeProject({
        id: 'project-red-deer',
        name: 'Red Deer Civic Centre',
        address: '200 Ross Street',
        region: 'Red Deer',
        status: 'Planning',
      }),
      makeProject({
        id: 'project-red-deer-duplicate',
        name: 'Red Deer Library',
        address: '4818 49 Street',
        region: 'Red Deer',
        status: 'Active',
      }),
      makeProject({
        id: 'project-empty-region',
        name: 'Region Pending',
        address: '1 Unknown Road',
        region: '',
      }),
    ];
    const requestUrls: string[] = [];

    await page.route('**/api/projects**', async (route) => {
      const url = new URL(route.request().url());
      requestUrls.push(`${url.pathname}${url.search}`);
      const status = url.searchParams.get('status');
      const region = url.searchParams.get('region');
      const search = url.searchParams.get('search')?.toLowerCase();
      const filtered = allProjects.filter((project) =>
        (!status || project.status === status)
        && (!region || project.region === region)
        && (!search || `${project.name} ${project.address} ${project.clientName}`.toLowerCase().includes(search)),
      );
      await route.fulfill({ json: filtered });
    });

    await page.goto('/__visual/project-cards');
    await expect(page.getByText(/\d+ days remaining/, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Project region' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();

    const regionFilter = page.getByRole('combobox', { name: 'Project region' });
    await expect(regionFilter.locator('option')).toHaveText(['All regions', 'Calgary', 'Red Deer']);

    await page.getByRole('combobox', { name: 'Project status' }).selectOption('Planning');
    await expect(page.getByRole('heading', { name: 'Red Deer Civic Centre' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calgary Tower Renewal' })).toBeHidden();
    await expect(regionFilter.locator('option')).toHaveText(['All regions', 'Calgary', 'Red Deer']);

    await regionFilter.selectOption('Red Deer');
    await expect(page.getByRole('heading', { name: 'Red Deer Civic Centre' })).toBeVisible();
    await expect.poll(() => requestUrls.some((url) => (
      url.includes('status=Planning') && url.includes('region=Red+Deer')
    ))).toBe(true);
    await expect.poll(() => requestUrls.filter((url) => url === '/api/projects').length).toBeGreaterThan(0);
    await expect(page.getByLabel('2 active filters')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(regionFilter).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Red Deer Civic Centre' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(regionFilter).toHaveValue('Red Deer');
    await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Calgary Tower Renewal' })).toBeVisible();
    await expect(page.getByLabel('2 active filters')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(regionFilter).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  });
});

test('administrators can switch between active and archived project lists', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
  });
  await page.route('**/api/users/me', route => route.fulfill({ json: { userId: 'user-admin', role: 'Admin' } }));
  const archivedProject = makeProject({
    id: 'archived-foundation',
    name: 'Archived Foundation',
    archivedAt: '2026-10-12T00:00:00.000Z',
    canManageLifecycle: true,
  });
  const requestedUrls: string[] = [];
  await page.route('**/api/projects**', async (route) => {
    const url = new URL(route.request().url());
    requestedUrls.push(`${url.pathname}${url.search}`);
    await route.fulfill({
      json: url.searchParams.get('archived') === 'true' ? [archivedProject] : [makeProject()],
    });
  });

  await page.goto('/__visual/project-cards');
  await expect(page.getByRole('heading', { name: 'All Projects' })).toBeVisible();
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archived Projects' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archived Foundation' })).toBeVisible();
  await expect.poll(() => requestedUrls.some((url) => url.includes('archived=true'))).toBe(true);
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Projects' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calgary Tower Renewal' })).toBeVisible();
});