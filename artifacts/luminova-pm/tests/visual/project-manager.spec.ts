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

test('project workflow links keep context and project tabs survive reload on mobile', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/projects/riverstone', route => route.fulfill({ json: project }));
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/panoramas', route => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/__visual/project-panorama?tab=budget');
  await expect(page.getByText('ID: riverstone', { exact: true })).toBeHidden();
  await page.locator('summary').filter({ hasText: 'Project reference' }).click();
  await expect(page.getByText('ID: riverstone', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Budget', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Trades', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Project workflow' }).getByRole('link', { name: 'Submit invoice', exact: true }))
    .toHaveAttribute('href', '/invoices?projectId=riverstone&submit=1');
  await expect(page.getByRole('navigation', { name: 'Project workflow' }).getByRole('link', { name: 'Project messages', exact: true }))
    .toHaveAttribute('href', '/messages?projectId=riverstone');
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page).toHaveURL(/tab=activity/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Users & Roles' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Projects', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('featured projects switch accessibly and fit mobile screens', async ({ page }) => {
  await installIdentity(page);
  await page.route('**/api/projects', route => route.fulfill({
    json: [project, { ...project, id: 'prairie', name: 'Prairie House', pmName: 'Sam Carter' }],
  }));
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: { activeProjects: 2, awaitingApproval: 0, unreadMessages: 0, new360Photos: 0, budgeted: 0, invoiced: 0, recentActivity: [] },
  }));
  await page.goto('/__visual/dashboard-cards');
  const stage = page.getByTestId('dashboard-project-stage');
  await expect(stage.getByRole('heading', { name: project.name })).toBeVisible();
  const alternate = page.getByTestId('button-stage-select-prairie');
  await alternate.focus();
  await page.keyboard.press('Enter');
  await expect(alternate).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.getByRole('heading', { name: 'Prairie House' })).toBeVisible();
  await expect(page.getByTestId('link-stage-open-project')).toHaveAttribute('href', '/projects/prairie');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage.getByRole('heading', { name: 'Prairie House' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('project highlights browse every project without crowding the banner', async ({ page }) => {
  await installIdentity(page);
  let highlights = Array.from({ length: 9 }, (_, i) => ({
    ...project, id: `highlight-${i + 1}`, name: `Project ${i + 1}`,
  }));
  await page.route('**/api/projects', route => route.fulfill({ json: highlights }));
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: { activeProjects: 9, awaitingApproval: 0, unreadMessages: 0, new360Photos: 0, budgeted: 0, invoiced: 0, recentActivity: [] },
  }));
  await page.goto('/__visual/dashboard-cards');
  const stage = page.getByTestId('dashboard-project-stage');
  const previous = page.getByTestId('button-stage-previous');
  const next = page.getByTestId('button-stage-next');
  await expect(stage.getByRole('heading', { name: 'Project 1' })).toBeVisible();
  await expect(stage.locator('.stage-count')).toContainText('01 / 09');
  await expect(stage.locator('.stage-thumb')).toHaveCount(5);

  await previous.focus();
  await page.keyboard.press('Enter');
  await expect(stage.getByRole('heading', { name: 'Project 9' })).toBeVisible();
  await expect(stage.locator('.stage-count')).toContainText('09 / 09');
  await expect(page.getByTestId('link-stage-open-project')).toHaveAttribute('href', '/projects/highlight-9');
  await next.click();
  await expect(stage.getByRole('heading', { name: 'Project 1' })).toBeVisible();
  for (let i = 0; i < 6; i++) await next.click();
  await expect(stage.getByRole('heading', { name: 'Project 7' })).toBeVisible();
  await expect(stage.locator('.stage-thumb')).toHaveCount(5);
  await expect(stage.getByTestId('button-stage-select-highlight-9')).toBeVisible();

  highlights = highlights.slice(0, 1);
  await page.reload();
  await expect(stage.getByRole('heading', { name: 'Project 1' })).toBeVisible();
  await expect(previous).toHaveCount(0);
  await expect(next).toHaveCount(0);
});

test('selects a workspace Project Manager while creating a project', async ({ page }) => {
  await installIdentity(page);
  let createdProject: Record<string, unknown> | null = null;
  await page.route('**/api/projects', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.projectManagerId).toBe('user-sam');
      expect(body.startDate).toBe('2026-09-01');
      expect(body).not.toHaveProperty('pmName');
      createdProject = {
        ...body,
        id: 'new-project',
        progress: 0,
        invoiced: 0,
        pmName: 'Sam Carter',
        exteriorImage: '',
      };
      await route.fulfill({
        status: 201,
        json: createdProject,
      });
      return;
    }
    await route.fulfill({ json: createdProject ? [createdProject] : [] });
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
  await dialog.locator('input[name="startDate"]').fill('2026-09-01');
  await dialog.locator('input[name="targetDate"]').fill('2027-04-30');
  await dialog.locator('input[name="budgeted"]').fill('250000');
  await dialog.locator('textarea[name="description"]').fill('New residential construction.');
  await dialog.getByRole('button', { name: 'Initialize', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(/\d+ days remaining/, { exact: true }).first()).toBeVisible();
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

test('edits the project start and end dates without exposing manual progress', async ({ page }) => {
  await installIdentity(page);
  let current = structuredClone(project);
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      expect(body.startDate).toBe('2026-02-01');
      expect(body.targetDate).toBe('2026-09-30');
      expect(body).not.toHaveProperty('progress');
      current = { ...current, ...body, progress: 74.3 };
      await route.fulfill({ json: current });
      return;
    }
    await route.fulfill({ json: current });
  });

  await page.goto('/__visual/project-panorama');
  await expect(page.getByText('Start: Mar 18, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('End: Feb 12, 2027', { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+ days remaining/, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Project' });
  await expect(dialog.getByLabel('Progress (%)')).toHaveCount(0);
  await expect(dialog.getByLabel('Start Date')).toHaveValue('2026-03-18');
  await dialog.getByLabel('End Date').fill('2026-09-30');
  await dialog.getByLabel('Start Date').fill('2026-02-01');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Start: Feb 1, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('End: Sep 30, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('74.3%', { exact: true })).toBeVisible();
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