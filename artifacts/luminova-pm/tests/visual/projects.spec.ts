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
  progress: 35,
  ...overrides,
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
  });
});