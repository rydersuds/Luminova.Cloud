import { expect, test, type Page } from '@playwright/test';

const managers = [
  { id: 'user-maya', name: 'Maya Chen', email: 'maya.chen@luminova.test' },
  { id: 'user-sam', name: 'Sam Carter', email: 'sam.carter@luminova.test' },
];

const project = {
  id: 'riverstone',
  name: 'Riverstone Residence',
  address: '128 Riverstone View, Calgary, AB',
  region: 'Calgary',
  status: 'In progress',
  progress: 64,
  pmName: 'Maya Chen',
  projectManagerId: 'user-maya',
  clientName: 'Avery & Morgan Reid',
  targetDate: '2027-02-12',
  budgeted: 186500000,
  invoiced: 112840000,
  exteriorImage: '',
  description: 'A warm modern infill home.',
  startDate: '2026-03-18',
  clientQuote: { total: 186500000, revision: 'Revision 3', portions: [] },
  lineItems: [],
  invoices: [],
  trades: [],
  photos: [],
  files: [],
  scheduleImages: [],
  panoramas: [],
  activity: [],
};

async function installIdentity(page: Page, role: 'Admin' | 'Project Manager' = 'Admin') {
  await page.addInitScript(() => {
    window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
  });
  await page.route('**/api/users/me', route => route.fulfill({
    json: { userId: role === 'Admin' ? 'user-admin' : 'user-maya', role },
  }));
  await page.route('**/api/users/project-managers', route => route.fulfill({ json: managers }));
}

test('selects a workspace Project Manager while creating a project', async ({ page }) => {
  await installIdentity(page);
  await page.route('**/api/projects', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.projectManagerId).toBe('user-sam');
      expect(body).not.toHaveProperty('pmName');
      await route.fulfill({
        status: 201,
        json: {
          ...body,
          id: 'new-project',
          progress: 0,
          invoiced: 0,
          pmName: 'Sam Carter',
          exteriorImage: '',
        },
      });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: {
      activeProjects: 0,
      awaitingApproval: 0,
      unreadMessages: 0,
      new360Photos: 0,
      budgeted: 0,
      invoiced: 0,
      recentActivity: [],
    },
  }));

  await page.goto('/__visual/dashboard-cards');
  await page.getByRole('button', { name: 'INITIALIZE PROJECT' }).click();
  const dialog = page.getByRole('dialog', { name: 'Initialize New Project' });
  await dialog.locator('input[name="name"]').fill('Prairie House');
  await dialog.locator('input[name="clientName"]').fill('North Ridge Development');
  await dialog.locator('select[name="status"]').selectOption('Planning');
  await dialog.getByLabel('PM Assignment').selectOption('user-sam');
  await dialog.locator('input[name="address"]').fill('100 Prairie Way');
  await dialog.locator('input[name="region"]').fill('Calgary');
  await dialog.locator('input[name="targetDate"]').fill('2027-04-30');
  await dialog.locator('input[name="budgeted"]').fill('250000');
  await dialog.locator('textarea[name="description"]').fill('New residential construction.');
  await dialog.getByRole('button', { name: 'Initialize', exact: true }).click();

  await expect(dialog).toBeHidden();
});

test('changes and displays a saved Project Manager across project surfaces', async ({ page }) => {
  await installIdentity(page);
  let current = structuredClone(project);
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      expect(body.projectManagerId).toBe('user-sam');
      current = { ...current, ...body, projectManagerId: 'user-sam', pmName: 'Sam Carter' };
      await route.fulfill({ json: current });
      return;
    }
    await route.fulfill({ json: current });
  });

  await page.goto('/__visual/project-panorama');
  await page.getByRole('button', { name: 'Edit Project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Project' });
  await expect(dialog.getByLabel('Project Manager')).toHaveValue('user-maya');
  await dialog.getByLabel('Project Manager').selectOption('user-sam');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Sam Carter', { exact: true })).toBeVisible();

  await page.route('**/api/projects', route => route.fulfill({ json: [current] }));
  await page.goto('/__visual/project-cards');
  await expect(page.getByRole('heading', { name: 'Riverstone Residence' })).toBeVisible();
  await expect(page.getByText('Sam Carter', { exact: true })).toBeVisible();
});

test('does not expose the assignment control to non-administrators', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', route => route.fulfill({ json: project }));

  await page.goto('/__visual/project-panorama');
  await page.getByRole('button', { name: 'Edit Project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Project' });
  await expect(dialog.getByLabel('Project Manager')).toHaveCount(0);
});