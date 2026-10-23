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

async function installIdentity(page: Page, role: 'Admin' | 'Project Manager' | 'Client' = 'Admin') {
  await page.addInitScript(() => {
    window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
  });
  await page.route('**/api/users/me', route => route.fulfill({
    json: { userId: role === 'Admin' ? 'user-admin' : role === 'Client' ? 'user-avery' : 'user-maya', role },
  }));
  await page.route('**/api/users/project-managers', route => route.fulfill({ json: managers }));
}

type BoardItemFixture = {
  id: string;
  projectId: string;
  groupId: string;
  name: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  startDate: string | null;
  endDate: string | null;
  costCents: number | null;
  dependsOnId: string | null;
  position: number;
};

function makeBoardItem(overrides: Partial<BoardItemFixture> = {}): BoardItemFixture {
  return {
    id: 'item-permit',
    projectId: 'riverstone',
    groupId: 'group-precon',
    name: 'Submit permit drawings',
    status: 'Working on it',
    priority: 'High',
    assignee: 'Maya Chen',
    startDate: '2026-10-13',
    endDate: '2026-10-15',
    costCents: null,
    dependsOnId: null,
    position: 0,
    ...overrides,
  };
}

function makeBoardState(items: BoardItemFixture[] = [makeBoardItem()]) {
  return {
    groups: [
      { id: 'group-precon', projectId: 'riverstone', name: 'Pre-construction', color: 'blue', position: 0 },
      { id: 'group-install', projectId: 'riverstone', name: 'Installation', color: 'gold', position: 1 },
    ],
    items,
  };
}

async function installProjectBoard(page: Page, state: ReturnType<typeof makeBoardState>) {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/projects/riverstone', route => route.fulfill({ json: project }));
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/panoramas', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/board', route => route.fulfill({ json: state }));
  await page.route('**/api/projects/riverstone/board/items**', async route => {
    const request = route.request();
    const method = request.method();
    if (method === 'POST') {
      const input = request.postDataJSON() as Partial<BoardItemFixture> & { groupId: string; name: string };
      const item = makeBoardItem({
        ...input,
        id: 'item-created',
        projectId: 'riverstone',
        groupId: input.groupId,
        name: input.name,
        status: input.status ?? 'Not started',
        position: state.items.filter(existing => existing.groupId === input.groupId).length,
      });
      state.items.push(item);
      return route.fulfill({ status: 201, json: item });
    }
    const itemId = new URL(request.url()).pathname.split('/').at(-1);
    const item = state.items.find(existing => existing.id === itemId);
    if (!item) return route.fulfill({ status: 404, json: { error: 'Item not found' } });

    if (method === 'PATCH') {
      const update = request.postDataJSON() as Partial<BoardItemFixture>;
      if (update.groupId && update.groupId !== item.groupId) {
        item.position = state.items.filter(existing => existing.groupId === update.groupId).length;
      }
      Object.assign(item, update);
      return route.fulfill({ json: item });
    }
    if (method === 'DELETE') {
      state.items = state.items.filter(existing => existing.id !== itemId);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
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
    json: { activeProjects: 2, awaitingApproval: 0, new360Photos: 0, budgetEnabledProjects: 0, budgeted: 0, invoiced: 0, recentActivity: [] },
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
    json: { activeProjects: 9, awaitingApproval: 0, new360Photos: 0, budgetEnabledProjects: 0, budgeted: 0, invoiced: 0, recentActivity: [] },
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
      new360Photos: 0,
      budgetEnabledProjects: 0,
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

test('keeps project initialization reachable on short desktop and mobile screens', async ({ page }) => {
  await installIdentity(page);
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: {
      activeProjects: 0,
      awaitingApproval: 0,
      new360Photos: 0,
      budgetEnabledProjects: 0,
      budgeted: 0,
      invoiced: 0,
      recentActivity: [],
    },
  }));
  await page.route('**/api/financials/summary', route => route.fulfill({
    json: {
      invoicedRevenue: 0,
      invoicedExpenses: 0,
      acceptedClientQuoteValue: 0,
      upcomingClientPayments: 0,
    },
  }));

  await page.goto('/__visual/dashboard-cards');

  for (const viewport of [{ width: 1280, height: 520 }, { width: 390, height: 480 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: /INITIALIZE PROJECT|NEW PROJECT/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Initialize New Project' });
    const title = dialog.getByRole('heading', { name: 'Initialize New Project' });
    const closeButton = dialog.getByRole('button', { name: 'Close' });
    const scrollArea = dialog.getByTestId('project-initialization-scroll-area');
    const submitButton = dialog.getByRole('button', { name: 'Initialize', exact: true });

    await expect(title).toBeVisible();
    await expect(closeButton).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    const titleBox = await title.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height);
    expect(titleBox!.y).toBeGreaterThanOrEqual(0);
    expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(viewport.height);

    const scrollMetrics = await scrollArea.evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    await scrollArea.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(submitButton).toBeInViewport();
    await expect(title).toBeVisible();
    await expect(closeButton).toBeVisible();
    await submitButton.click();
    await expect(dialog).toBeVisible();
    await closeButton.click();
    await expect(dialog).toBeHidden();
  }
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

test('hides and restores the project board without changing its tasks', async ({ page }) => {
  await installIdentity(page);
  let current = { ...structuredClone(project), scheduleAvailable: true };
  const state = makeBoardState();
  const originalItems = structuredClone(state.items);
  const scheduleUpdates: boolean[] = [];
  let boardReads = 0;

  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'PATCH') {
      const update = route.request().postDataJSON() as { scheduleAvailable: boolean };
      scheduleUpdates.push(update.scheduleAvailable);
      current = { ...current, ...update };
      await route.fulfill({ json: current });
      return;
    }
    await route.fulfill({ json: current });
  });
  await page.route('**/api/projects/riverstone/panoramas', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/board', route => {
    boardReads += 1;
    return route.fulfill({ json: state });
  });

  await page.goto('/__visual/project-panorama?tab=board');
  await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Submit permit drawings', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Edit Project' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit Project' });
  const scheduleUnavailable = editDialog.getByTestId('input-schedule-not-available');
  await scheduleUnavailable.check();
  await editDialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => scheduleUpdates).toEqual([false]);
  expect(state.items).toEqual(originalItems);

  // A bookmarked board URL must land on Overview after the schedule is hidden.
  await page.goto('/__visual/project-panorama?tab=board');
  await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(boardReads).toBe(1);
  expect(state.items).toEqual(originalItems);

  await page.getByRole('button', { name: 'Edit Project' }).click();
  const restoreDialog = page.getByRole('dialog', { name: 'Edit Project' });
  await restoreDialog.getByTestId('input-schedule-not-available').uncheck();
  await restoreDialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(restoreDialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Submit permit drawings', { exact: true }).first()).toBeVisible();
  await expect.poll(() => scheduleUpdates).toEqual([false, true]);
  expect(state.items).toEqual(originalItems);
});

test('does not expose the assignment control to non-administrators', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', route => route.fulfill({
    json: { ...project, canManageLifecycle: true },
  }));

  await page.goto('/__visual/project-panorama');
  await expect(page.getByRole('button', { name: 'Archive project', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete permanently', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Project' });
  await expect(dialog.getByLabel('Project Manager')).toHaveCount(0);
});

test('administrators get safe archive and permanent-delete confirmations', async ({ page }) => {
  await installIdentity(page, 'Admin');
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/delete-preview', route => route.fulfill({
    json: {
      recordCount: 12,
      recordBreakdown: [
        { category: 'project', count: 1 },
        { category: 'importData', count: 2 },
        { category: 'documents', count: 2 },
        { category: 'invoices', count: 1 },
        { category: 'vendorQuotes', count: 1 },
        { category: 'conversations', count: 0 },
        { category: 'schedule', count: 2 },
        { category: 'panoramas', count: 1 },
        { category: 'exteriorPhotos', count: 0 },
        { category: 'projectHistory', count: 1 },
        { category: 'purchaseApprovals', count: 1 },
      ],
      storedFileCount: 3,
      previewToken: 'a'.repeat(64),
    },
  }));
  await page.route('**/api/projects/riverstone', route => route.fulfill({
    json: { ...project, canManageLifecycle: true, archivedAt: null },
  }));

  await page.goto('/__visual/project-panorama');
  await page.getByRole('button', { name: 'Archive project', exact: true }).click();
  const archiveDialog = page.getByRole('dialog', { name: 'Archive this project?' });
  await expect(archiveDialog).toContainText('history and files will be kept');
  await archiveDialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Permanently delete this project?' });
  await expect(deleteDialog).toContainText('Shared vendor profiles and other projects will not be deleted');
  await expect(deleteDialog).toContainText('12 records and 3 stored files will be removed');
  await expect(deleteDialog).toContainText('Documents');
  await expect(deleteDialog).toContainText('Invoices');
  await expect(deleteDialog).toContainText('Schedule items and related data');
  await expect(deleteDialog).toContainText('Project history');
  const confirmDelete = deleteDialog.getByRole('button', { name: 'Delete permanently', exact: true });
  await expect(confirmDelete).toBeDisabled();
  await deleteDialog.getByLabel('Type Riverstone Residence to confirm.').fill('Riverstone Residence');
  await expect(confirmDelete).toBeEnabled();
});

test('archived project detail shows restore and permanent-delete actions', async ({ page }) => {
  await installIdentity(page, 'Admin');
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/archived', route => route.fulfill({
    json: {
      ...project,
      archivedAt: '2026-10-12T00:00:00.000Z',
      canManageLifecycle: true,
    },
  }));

  await page.goto('/__visual/project-panorama?archived=true');
  await expect(page.getByRole('button', { name: 'Restore project', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete permanently', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive project', exact: true })).toHaveCount(0);
});

test('shows project board groups and scheduled work', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/projects/riverstone', route => route.fulfill({
    json: {
      ...project,
      scheduleImages: [{
        id: 'legacy-schedule',
        url: '/legacy-schedule.png',
        name: 'legacy-schedule.png',
        relativePath: 'Schedules/legacy-schedule.png',
        contentType: 'image/png',
        size: 2048,
        revision: 'Revision 2',
        effectiveDate: '2026-08-20',
        isCurrent: true,
      }],
    },
  }));
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/panoramas', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone/board', route => route.fulfill({
    json: {
      groups: [{ id: 'group-precon', projectId: 'riverstone', name: 'Pre-construction', color: 'blue', position: 0 }],
      items: [{
        id: 'item-permit',
        projectId: 'riverstone',
        groupId: 'group-precon',
        name: 'Submit permit drawings',
        status: 'Working on it',
        priority: 'High',
        assignee: 'Maya Chen',
        startDate: '2026-10-13',
        endDate: '2026-10-15',
        costCents: null,
        dependsOnId: null,
        position: 0,
      }],
    },
  }));

  await page.goto('/__visual/project-panorama?tab=board');
  await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Project board' })).toBeVisible();
  await expect(page.getByText('Pre-construction', { exact: true })).toBeVisible();
  await expect(page.getByText('Submit permit drawings', { exact: true }).first()).toBeVisible();

  for (const view of ['Timeline', 'Calendar', 'Table']) {
    const control = page.getByRole('button', { name: view, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Submit permit drawings', { exact: true }).first()).toBeVisible();
  }
});

test('reviews, fixes, maps, and confirms imported board rows before appending them', async ({ page }) => {
  const state = makeBoardState([]);
  await installProjectBoard(page, state);
  await page.route('**/api/projects/riverstone/board/import/preview', route => route.fulfill({
    json: {
      groups: ['Pre-construction', 'Electrical'],
      rows: [
        {
          rowNumber: 2, sourceGroup: 'Pre-construction', name: 'Permit review', status: 'Working on it',
          priority: null, assignee: 'Maya Chen', startDate: '2026-10-20', endDate: null, costCents: null, issues: [],
        },
        {
          rowNumber: 3, sourceGroup: 'Electrical', name: '', status: null, priority: null, assignee: null,
          startDate: null, endDate: null, costCents: null, issues: ['Task name is required.'],
        },
      ],
    },
  }));
  await page.route('**/api/projects/riverstone/board/import', async route => {
    const input = route.request().postDataJSON() as {
      groupsToCreate: Array<{ key: string; name: string; color: string }>;
      items: Array<{ groupRef: string; name: string; status?: string; priority: string | null; assignee: string | null; startDate: string | null; endDate: string | null; costCents: number | null }>;
    };
    const createdGroups = input.groupsToCreate.map((group, index) => ({
      id: `group-import-${index}`, projectId: 'riverstone', name: group.name, color: group.color, position: state.groups.length + index,
    }));
    const groupByRef = new Map([
      ...state.groups.map(group => [group.id, group] as const),
      ...input.groupsToCreate.map((group, index) => [group.key, createdGroups[index]] as const),
    ]);
    const createdItems = input.items.map((item, index) => {
      const group = groupByRef.get(item.groupRef)!;
      return {
        id: `item-import-${index}`, projectId: 'riverstone', groupId: group.id, name: item.name,
        status: item.status ?? 'Not started', priority: item.priority, assignee: item.assignee,
        startDate: item.startDate, endDate: item.endDate, costCents: item.costCents,
        dependsOnId: null, position: state.items.filter(existing => existing.groupId === group.id).length,
      };
    });
    state.groups.push(...createdGroups);
    state.items.push(...createdItems);
    await route.fulfill({ status: 201, json: { groups: createdGroups, items: createdItems } });
  });

  await page.goto('/__visual/project-panorama?tab=board');
  await page.getByTestId('button-import-board-file').click();
  const chooser = page.getByTestId('input-board-import-file');
  await chooser.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByTestId('alert-board-import')).toContainText('Choose a CSV, XLSX, PDF, JPEG, or PNG file.');

  await chooser.setInputFiles({ name: 'schedule.csv', mimeType: 'text/csv', buffer: Buffer.from('Task,Group\\nPermit review,Pre-construction') });
  const dialog = page.getByRole('dialog', { name: 'Import schedule rows' });
  await expect(dialog.getByTestId('text-board-import-count')).toHaveText('2 rows detected');
  await expect(dialog.getByTestId('button-confirm-board-import')).toBeDisabled();
  await dialog.getByLabel('Task name for row 3').fill('Install electrical rough-in');
  await dialog.getByLabel('New group name for Electrical').fill('Electrical rough-in');
  const confirm = dialog.getByTestId('button-confirm-board-import');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.locator('button[aria-label^="Item name: Install electrical"]')).toBeVisible();
  await expect(page.locator('button[aria-label^="Item name: Permit review"]')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(state.groups.some(group => group.name === 'Electrical rough-in')).toBe(true);
  expect(state.items.map(item => item.name)).toEqual(['Permit review', 'Install electrical rough-in']);
});

test('shows portfolio schedule items and switches to calendar view', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/board-items', route => route.fulfill({
    json: [{
      id: 'item-permit',
      projectId: 'riverstone',
      projectName: 'Riverstone Residence',
      groupId: 'group-precon',
      groupName: 'Pre-construction',
      groupColor: 'blue',
      name: 'Submit permit drawings',
      status: 'Working on it',
      priority: 'High',
      assignee: 'Maya Chen',
      startDate: '2026-10-13',
      endDate: '2026-10-15',
      costCents: null,
      dependsOnId: null,
      position: 0,
    }],
  }));
  await page.clock.install({ time: new Date('2026-10-12T12:00:00.000Z') });

  await page.goto('/__visual/schedule');
  await expect(page.getByRole('heading', { name: 'Schedule', exact: true })).toBeVisible();
  const weekSection = page.getByRole('region', { name: 'Happening this week' });
  await expect(weekSection.getByText('Submit permit drawings', { exact: true })).toBeVisible();
  const calendarButton = page.getByRole('button', { name: 'Calendar', exact: true });
  await calendarButton.click();
  await expect(calendarButton).toHaveAttribute('aria-pressed', 'true');
  await expect(weekSection.getByText('Submit permit drawings', { exact: true })).toBeVisible();
});

test('creates, edits, moves, and deletes a board item', async ({ page }) => {
  const state = makeBoardState([]);
  await installProjectBoard(page, state);
  await page.goto('/__visual/project-panorama?tab=board');

  const precon = page.getByRole('region', { name: 'Pre-construction' });
  await precon.getByRole('textbox', { name: 'Add item to Pre-construction' }).fill('Order windows');
  await precon.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(precon.getByRole('button', { name: 'Item name: Order windows. Click to edit' })).toBeVisible();
  expect(state.items).toHaveLength(1);

  await page.getByRole('button', { name: 'Item name: Order windows. Click to edit' }).click();
  const nameEditor = page.getByRole('textbox', { name: 'Item name' });
  await nameEditor.fill('Order windows and doors');
  await nameEditor.press('Enter');
  await expect(page.getByText('Order windows and doors', { exact: true })).toBeVisible();
  expect(state.items[0].name).toBe('Order windows and doors');

  await page.getByRole('button', { name: 'Order windows and doors options' }).click();
  await page.getByRole('menuitem', { name: 'Installation' }).click();
  const installation = page.getByRole('region', { name: 'Installation' });
  await expect(installation.getByRole('button', { name: 'Item name: Order windows and doors. Click to edit' })).toBeVisible();
  expect(state.items[0].groupId).toBe('group-install');

  await page.getByRole('button', { name: 'Order windows and doors options' }).click();
  await page.getByRole('menuitem', { name: 'Delete item' }).click();
  await page.getByRole('menuitem', { name: 'Click again to delete' }).click();
  await expect(installation.getByRole('button', { name: 'Item name: Order windows and doors. Click to edit' })).toBeHidden();
  expect(state.items).toHaveLength(0);
});

test('date edits survive a refresh and appear in the portfolio schedule', async ({ page }) => {
  const state = makeBoardState();
  await installProjectBoard(page, state);
  await page.route('**/api/board-items', route => route.fulfill({
    json: state.items
      .filter(item => item.startDate || item.endDate)
      .map(item => ({
        ...item,
        projectName: project.name,
        groupName: state.groups.find(group => group.id === item.groupId)?.name ?? '',
        groupColor: state.groups.find(group => group.id === item.groupId)?.color ?? 'gold',
      })),
  }));

  await page.goto('/__visual/project-panorama?tab=board');
  await page.getByRole('button', { name: /Dates:.*Change dates/ }).click();
  await page.getByLabel('Start', { exact: true }).fill('2026-11-03');
  await page.getByLabel('End', { exact: true }).fill('2026-11-07');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.getByRole('button', { name: /Dates: Nov 3 – Nov 7/ })).toBeVisible();
  expect(state.items[0].startDate).toBe('2026-11-03');
  expect(state.items[0].endDate).toBe('2026-11-07');

  await page.goto('/__visual/schedule');
  await page.reload();
  await expect(page.getByRole('img', { name: /Submit permit drawings, Working on it, Nov 3.*Nov 7/ })).toBeVisible();
});

test('Day board shows a scrollable daily ruler and keeps date and status edits available', async ({ page }) => {
  const state = makeBoardState([
    makeBoardItem(),
    makeBoardItem({
      id: 'item-undated',
      name: 'Schedule inspection',
      startDate: null,
      endDate: null,
      status: 'Not started',
      position: 1,
    }),
  ]);
  await installProjectBoard(page, state);
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/__visual/project-panorama?tab=board');
  await page.getByRole('button', { name: 'Day', exact: true }).click();

  const timeline = page.getByRole('region', { name: 'Day-by-day timeline. Scroll horizontally to browse dates.' });
  await expect(timeline).toBeVisible();
  await expect(timeline.locator('[data-date="2026-10-12"]')).toBeVisible();
  await expect(timeline.locator('[data-date="2026-10-13"]')).toBeVisible();
  await expect(timeline.locator('[data-date="2026-10-14"]')).toBeVisible();
  await expect(timeline.locator('.board-day-date-today')).toHaveAttribute('data-date', '2026-10-12');
  await expect(timeline.locator('.board-day-today-marker')).toContainText('Today');
  await expect(timeline.getByRole('button', { name: 'Add dates' })).toBeVisible();

  const taskLabel = page.locator('.board-day-item-label').filter({ hasText: 'Submit permit drawings' });
  const labelBefore = await taskLabel.boundingBox();
  await timeline.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect.poll(() => timeline.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const labelAfter = await taskLabel.boundingBox();
  expect(labelAfter?.x).toBe(labelBefore?.x);

  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.locator('.board-day-date-input')).toHaveValue('2026-10-13');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.board-day-date-input')).toHaveValue('2026-10-12');

  const bar = timeline.locator('[aria-roledescription="draggable timeline bar"]');
  await bar.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => state.items[0].startDate).toBe('2026-10-14');
  await expect.poll(() => state.items[0].endDate).toBe('2026-10-16');

  await page.getByRole('button', { name: /Dates: Oct 14 – Oct 16/ }).click();
  await page.getByLabel('Start', { exact: true }).fill('2026-11-03');
  await page.getByLabel('End', { exact: true }).fill('2026-11-07');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect.poll(() => state.items[0].startDate).toBe('2026-11-03');
  await expect.poll(() => state.items[0].endDate).toBe('2026-11-07');

  await page.getByRole('button', { name: 'Status: Working on it. Change status' }).click();
  await page.getByRole('menuitem', { name: 'Done' }).click();
  await expect.poll(() => state.items[0].status).toBe('Done');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(timeline).toBeVisible();
  await expect(timeline.locator('[aria-roledescription="draggable timeline bar"]')).toBeVisible();
  const mobileWidth = await timeline.evaluate(element => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(mobileWidth.scroll).toBeGreaterThan(mobileWidth.client);
  expect(mobileWidth.client).toBeLessThanOrEqual(mobileWidth.viewport);
});

test('keeps a failed board edit available to retry and explains the failure', async ({ page }) => {
  const state = makeBoardState();
  await installProjectBoard(page, state);
  let updateAttempts = 0;
  await page.unroute('**/api/projects/riverstone/board/items**');
  await page.route('**/api/projects/riverstone/board/items**', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    updateAttempts += 1;
    if (updateAttempts === 1) {
      return route.fulfill({ status: 503, json: { error: 'Temporary board save failure.' } });
    }
    const update = route.request().postDataJSON() as Partial<BoardItemFixture>;
    Object.assign(state.items[0], update);
    return route.fulfill({ json: state.items[0] });
  });

  await page.goto('/__visual/project-panorama?tab=board');
  await page.getByRole('button', { name: 'Item name: Submit permit drawings. Click to edit' }).click();
  const editor = page.getByRole('textbox', { name: 'Item name' });
  await editor.fill('Submit revised permit drawings');
  await editor.press('Enter');

  await expect(page.getByText('Change not saved', { exact: true })).toBeVisible();
  await expect(editor).toHaveValue('Submit revised permit drawings');
  expect(state.items[0].name).toBe('Submit permit drawings');

  await editor.press('Enter');
  await expect(page.getByText('Submit revised permit drawings', { exact: true })).toBeVisible();
  expect(state.items[0].name).toBe('Submit revised permit drawings');
  expect(updateAttempts).toBe(2);
});

test('quick view keeps urgent project information readable on phones', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: {
      activeProjects: 1,
      awaitingApproval: 1,
      new360Photos: 1,
      budgetEnabledProjects: 1,
      budgeted: project.budgeted,
      invoiced: project.invoiced,
      recentActivity: [{
        id: 'activity-permit',
        title: 'Permit review started',
        description: 'The city has started reviewing the revised drawings.',
        author: 'Maya Chen',
        date: '2026-10-13',
      }],
    },
  }));
  await page.route('**/api/invoices/summary', route => route.fulfill({
    json: {
      invoicedRevenue: project.invoiced,
      invoicedExpenses: 52300000,
      upcomingClientPayments: 0,
      acceptedClientQuoteValue: 0,
    },
  }));
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  await page.route('**/api/board-items', route => route.fulfill({
    json: [{
      ...makeBoardItem(),
      projectName: project.name,
      groupName: 'Pre-construction',
      groupColor: 'blue',
    }],
  }));
  await page.route('**/api/purchase-approvals', route => route.fulfill({
    json: [{
      id: 'approval-electrical',
      projectId: project.id,
      projectName: project.name,
      kind: 'invoice',
      invoiceId: null,
      budgetLineItemId: null,
      tradeLabel: 'Electrical',
      vendor: 'North Ridge Electric',
      description: 'Panel upgrade',
      amount: 1250,
      remainingBefore: 1000,
      overage: 250,
      status: 'Pending approval',
      approvalReason: 'over_budget',
      requestedById: 'user-maya',
      requestedByName: 'Maya Chen',
      requestedAt: '2026-10-13T12:00:00.000Z',
      decidedByName: null,
      decidedAt: null,
      decisionNote: null,
      budgetIncrease: null,
    }],
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/__visual/mobile-overview');
  await expect(page.getByTestId('page-mobile-overview')).toBeVisible();
  await expect(page.getByTestId('link-signal-unread')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'The work, at a glance.' })).toBeVisible();
  await expect(page.getByTestId('value-client-revenue')).toHaveText('$112,840,000');
  await expect(page.getByTestId('value-budget-usage')).toContainText('$52,300,000');
  await expect(page.getByText('Recorded internal costs / budget')).toBeVisible();
  await expect(page.getByTestId('value-signal-active-sites')).toHaveText('1');
  await expect(page.getByTestId('link-schedule-item-item-permit')).toBeVisible();
  await expect(page.getByTestId('link-approval-approval-electrical')).toBeVisible();
  await expect(page.getByTestId('card-project-riverstone')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const quickViewLink = page.getByRole('link', { name: 'Quick View' });
  await expect(quickViewLink).toBeVisible();
  await expect(quickViewLink).toHaveAttribute('href', '/mobile');
  await page.getByRole('button', { name: 'Close navigation' }).click();

  await page.setViewportSize({ width: 360, height: 740 });
  await expect(page.getByRole('heading', { name: 'The work, at a glance.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('quick view keeps client revenue visible when all project budgets are disabled', async ({ page }) => {
  await installIdentity(page, 'Project Manager');
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: {
      activeProjects: 1,
      awaitingApproval: 0,
      new360Photos: 0,
      budgetEnabledProjects: 0,
      budgeted: 0,
      invoiced: 125000,
      recentActivity: [],
    },
  }));
  await page.route('**/api/projects', route => route.fulfill({ json: [{ ...project, budgetEnabled: false }] }));
  await page.route('**/api/board-items', route => route.fulfill({ json: [] }));
  await page.route('**/api/purchase-approvals', route => route.fulfill({ json: [] }));
  let financialSummaryRequests = 0;
  await page.route('**/api/invoices/summary', route => {
    financialSummaryRequests += 1;
    return route.fulfill({ json: { invoicedRevenue: project.invoiced, invoicedExpenses: 52300000, upcomingClientPayments: 0, acceptedClientQuoteValue: 0 } });
  });

  await page.goto('/__visual/mobile-overview');
  await expect(page.getByTestId('value-client-revenue')).toHaveText('$125,000');
  await expect(page.getByTestId('value-budget-usage')).toHaveCount(0);
  await expect(page.getByText('Recorded internal costs / budget')).toHaveCount(0);
  expect(financialSummaryRequests).toBe(0);
});

test('quick view hides internal schedule and approvals from clients', async ({ page }) => {
  await installIdentity(page, 'Client');
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: {
      activeProjects: 1,
      awaitingApproval: 1,
      new360Photos: 0,
      budgetEnabledProjects: 1,
      budgeted: project.budgeted,
      invoiced: project.invoiced,
      recentActivity: [],
    },
  }));
  await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
  let scheduleRequests = 0;
  let approvalRequests = 0;
  await page.route('**/api/board-items', route => {
    scheduleRequests += 1;
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/purchase-approvals', route => {
    approvalRequests += 1;
    return route.fulfill({ json: [] });
  });

  await page.goto('/__visual/mobile-overview');
  await expect(page.getByTestId('status-schedule-unavailable')).toBeVisible();
  await expect(page.getByTestId('status-approvals-restricted')).toBeVisible();
  await expect(page.getByTestId('link-signal-for-approval')).toHaveCount(0);
  await expect(page.getByTestId('link-full-schedule')).toHaveCount(0);
  expect(scheduleRequests).toBe(0);
  expect(approvalRequests).toBe(0);
});

for (const failedEntry of ['file', 'directory'] as const) {
  test(`a dropped ${failedEntry} that disappears during reading shows recovery guidance without starting an import`, async ({ page }) => {
    await installIdentity(page);
    let createSessionRequests = 0;
    await page.route('**/api/project-import-sessions', async route => {
      if (route.request().method() === 'POST') createSessionRequests += 1;
      await route.fulfill({ json: null });
    });
    await page.route('**/api/projects', route => route.fulfill({ json: [project] }));
    await page.route('**/api/dashboard/summary', route => route.fulfill({
      json: { activeProjects: 1, awaitingApproval: 0, new360Photos: 0, budgetEnabledProjects: 0, budgeted: 0, invoiced: 0, recentActivity: [] },
    }));
    await page.route('**/api/invoices/summary', route => route.fulfill({
      json: { invoicedRevenue: 0, invoicedExpenses: 0, upcomingClientPayments: 0, acceptedClientQuoteValue: 0 },
    }));

    await page.goto('/__visual/dashboard-cards');
    await page.getByRole('button', { name: /INITIALIZE PROJECT|NEW PROJECT/ }).click();
    await page.getByRole('button', { name: 'Batch Import' }).click();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.evaluate((entryType) => {
      const dropzone = document.querySelector<HTMLElement>('[data-testid="project-folder-dropzone"]');
      if (!dropzone) throw new Error('Project folder drop zone was not found');
      const file = new File(['plan'], 'site-plan.txt', { type: 'text/plain' });
      const missing = () => new DOMException(
        'A requested file or directory could not be found at the time an operation was processed.',
        'NotFoundError',
      );
      const entry = entryType === 'file'
        ? {
            isFile: true,
            isDirectory: false,
            name: 'site-plan.txt',
            file: (_success: (file: File) => void, failure: (error: DOMException) => void) => queueMicrotask(() => failure(missing())),
          }
        : {
            isFile: false,
            isDirectory: true,
            name: 'Site Plans',
            createReader: () => ({
              readEntries: (_success: (entries: unknown[]) => void, failure: (error: DOMException) => void) => queueMicrotask(() => failure(missing())),
            }),
          };
      const event = new DragEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', {
        value: { items: [{ webkitGetAsEntry: () => entry }], files: [file] },
      });
      dropzone.dispatchEvent(event);
    }, failedEntry);

    await expect(
      page.getByTestId('project-folder-dropzone').getByRole('alert'),
    ).toContainText('could not be read');
    expect(createSessionRequests).toBe(0);
    expect(pageErrors).toEqual([]);
  });
}
