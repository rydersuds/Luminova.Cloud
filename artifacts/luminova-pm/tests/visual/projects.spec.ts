import { expect, test } from '@playwright/test';

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