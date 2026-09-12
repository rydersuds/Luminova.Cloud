import { expect, test } from '@playwright/test';

const avatarUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" rx="48" fill="%23c8ae4b"/%3E%3Ctext x="48" y="58" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="%23202020"%3EMR%3C/text%3E%3C/svg%3E';

const workspaceUsers = [
  {
    id: 'user-morgan',
    firstName: 'Morgan',
    lastName: 'Reyes',
    name: 'Morgan Reyes',
    email: 'morgan@luminova.test',
    imageUrl: avatarUrl,
    role: 'Admin',
    clientAccessCleanupPending: false,
  },
  {
    id: 'user-sam',
    firstName: 'Sam',
    lastName: 'Carter',
    name: 'Sam Carter',
    email: 'sam.carter@luminova.test',
    imageUrl: avatarUrl,
    role: 'Project Manager',
    clientAccessCleanupPending: false,
  },
  {
    id: 'user-jordan',
    firstName: 'Jordan',
    lastName: 'Lee',
    name: 'Jordan Lee',
    email: 'jordan.lee@luminova.test',
    imageUrl: avatarUrl,
    role: 'Field Team',
    clientAccessCleanupPending: false,
  },
  {
    id: 'user-taylor',
    firstName: 'Taylor',
    lastName: 'Nguyen',
    name: 'Taylor Nguyen',
    email: 'taylor.nguyen@luminova.test',
    imageUrl: avatarUrl,
    role: 'Client',
    clientAccessCleanupPending: false,
  },
];

const invitations = [
  {
    id: 'invitation-1',
    email: 'new.member@luminova.test',
    role: 'Project Manager',
    createdAt: '2026-09-08T15:00:00.000Z',
  },
];

const clients = [
  {
    id: 'client-north-ridge',
    name: 'North Ridge Development',
    members: [
      {
        userId: 'user-taylor',
        name: 'Taylor Nguyen',
        email: 'taylor.nguyen@luminova.test',
      },
    ],
  },
];

const installUsersFixtures = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/users', (route) => route.fulfill({ json: workspaceUsers }));
  await page.route('**/api/users/invitations', (route) => route.fulfill({ json: invitations }));
  await page.route('**/api/clients', (route) => route.fulfill({ json: clients }));
};

const assertWorkspaceSurface = async (page: import('@playwright/test').Page) => {
  await expect(page.getByTestId('app-layout')).toBeVisible();
  await expect(page.getByTestId('app-background')).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    pageScrollWidth: document.querySelector<HTMLElement>('[data-testid="users-page-scroll"]')?.scrollWidth,
    pageClientWidth: document.querySelector<HTMLElement>('[data-testid="users-page-scroll"]')?.clientWidth,
  }))).toEqual({
    documentWidth: await page.evaluate(() => window.innerWidth),
    viewportWidth: await page.evaluate(() => window.innerWidth),
    pageScrollWidth: await page.getByTestId('users-page-scroll').evaluate((element) => element.clientWidth),
    pageClientWidth: await page.getByTestId('users-page-scroll').evaluate((element) => element.clientWidth),
  });
};

test.describe('Users & Roles background treatment', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
    });
    await installUsersFixtures(page);
  });

  test('keeps the shell background continuous across the users tab and invite form', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/users');
    await expect(page.getByRole('heading', { name: 'Users & Roles' })).toBeVisible();
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('desktop-users.png', { animations: 'disabled' });

    await page.getByRole('button', { name: 'Invite user' }).click();
    await expect(page.getByRole('button', { name: 'Cancel invite' })).toBeVisible();
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('desktop-users-invite.png', { animations: 'disabled' });

    await page.getByLabel('Email address').fill('invalid-email');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('desktop-users-feedback.png', { animations: 'disabled' });

  });

  test('keeps the shell background continuous on mobile across both tabs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__visual/users');
    await expect(page.getByRole('heading', { name: 'Users & Roles' })).toBeVisible();
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('mobile-users.png', { animations: 'disabled' });

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await assertWorkspaceSurface(page);

    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.getByRole('heading', { name: 'Users & Roles' })).toBeVisible();
    await expect(page.getByText('North Ridge Development')).toBeVisible();
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('mobile-clients.png', { animations: 'disabled' });
  });

  test('retries pending client access cleanup and hides the warning after reconciliation', async ({ page }) => {
    let usersResponse = workspaceUsers.map((user) => (
      user.id === 'user-sam' || user.id === 'user-jordan'
        ? { ...user, clientAccessCleanupPending: true }
        : user
    ));
    const reconciliationRequests: string[] = [];

    await page.route('**/api/users', (route) => route.fulfill({ json: usersResponse }));
    for (const userId of ['user-sam', 'user-jordan']) {
      await page.route(`**/api/users/${userId}/client-access-reconciliation`, async (route) => {
        expect(route.request().method()).toBe('POST');
        reconciliationRequests.push(userId);
        usersResponse = usersResponse.map((user) => (
          user.id === userId ? { ...user, clientAccessCleanupPending: false } : user
        ));
        await route.fulfill({ status: 204, body: '' });
      });
    }

    await page.goto('/__visual/users');
    const cleanupWarning = page.getByRole('alert').filter({ hasText: 'Role changes succeeded' });
    await expect(cleanupWarning.getByRole('heading', { name: 'Client access needs reconciliation' })).toBeVisible();
    await expect(cleanupWarning.getByText('2 pending')).toBeVisible();
    await expect(cleanupWarning.getByRole('button', { name: 'Retry cleanup' })).toHaveCount(2);

    await cleanupWarning.getByText('Sam Carter', { exact: true }).locator('../..').getByRole('button', { name: 'Retry cleanup' }).click();
    await expect.poll(() => reconciliationRequests).toEqual(['user-sam']);
    await expect(cleanupWarning.getByText('2 pending')).toBeHidden();
    await expect(cleanupWarning.getByText('1 pending')).toBeVisible();
    await expect(cleanupWarning.getByText('Sam Carter', { exact: true })).toBeHidden();
    await expect(cleanupWarning.getByText('Jordan Lee', { exact: true })).toBeVisible();

    await cleanupWarning.getByText('Jordan Lee', { exact: true }).locator('../..').getByRole('button', { name: 'Retry cleanup' }).click();
    await expect.poll(() => reconciliationRequests).toEqual(['user-sam', 'user-jordan']);
    await expect(page.getByRole('heading', { name: 'Client access needs reconciliation' })).toBeHidden();
    await expect(page.getByText("Jordan Lee's client access was reconciled.")).toBeVisible();
  });

  test('retries all pending cleanups while keeping a failed user actionable', async ({ page }) => {
    let usersResponse = workspaceUsers.map((user) => (
      user.id === 'user-sam' || user.id === 'user-jordan'
        ? { ...user, clientAccessCleanupPending: true }
        : user
    ));
    let bulkRequests = 0;

    await page.route('**/api/users', (route) => route.fulfill({ json: usersResponse }));
    await page.route('**/api/users/client-access-reconciliation', async (route) => {
      expect(route.request().method()).toBe('POST');
      bulkRequests += 1;
      usersResponse = usersResponse.map((user) => (
        user.id === 'user-sam' ? { ...user, clientAccessCleanupPending: false } : user
      ));
      await route.fulfill({
        json: {
          reconciled: ['user-sam'],
          failed: [{ userId: 'user-jordan', error: 'Client access cleanup failed again. Try reconciling this user again.' }],
        },
      });
    });
    await page.route('**/api/users/user-jordan/client-access-reconciliation', async (route) => {
      expect(route.request().method()).toBe('POST');
      usersResponse = usersResponse.map((user) => ({ ...user, clientAccessCleanupPending: false }));
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/__visual/users');
    await expect(page.getByRole('heading', { name: 'Client access needs reconciliation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry all cleanup' })).toBeVisible();

    await page.getByRole('button', { name: 'Retry all cleanup' }).click();
    await expect.poll(() => bulkRequests).toBe(1);
    await expect(page.getByText('1 cleanup reconciled. 1 cleanup still need attention. Retry them individually.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jordan Lee' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry cleanup' })).toBeVisible();

    await page.getByRole('button', { name: 'Retry cleanup' }).click();
    await expect(page.getByRole('heading', { name: 'Client access needs reconciliation' })).toBeHidden();
  });
});
