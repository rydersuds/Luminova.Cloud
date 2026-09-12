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
  {
    id: 'user-casey',
    firstName: 'Casey',
    lastName: 'Brooks',
    name: 'Casey Brooks',
    email: 'casey.brooks@luminova.test',
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
    logoUrl: null,
    createdAt: Date.parse('2026-09-01T15:00:00.000Z'),
    pendingInvitations: [
      {
        id: 'client-invitation-1',
        email: 'pending.client@luminova.test',
        role: 'Client',
        status: 'pending',
        createdAt: Date.parse('2026-09-10T15:00:00.000Z'),
      },
    ],
    members: [
      {
        id: 'client-member-taylor',
        userId: 'user-taylor',
        name: 'Taylor Nguyen',
        email: 'taylor.nguyen@luminova.test',
        imageUrl: avatarUrl,
        role: 'Client',
        addedAt: Date.parse('2026-09-02T15:00:00.000Z'),
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

    const projectManagers = page.getByTestId('project-managers-section');
    await expect(projectManagers.getByRole('heading', { name: 'Project Managers' })).toBeVisible();
    await expect(projectManagers.getByTestId('project-managers-count')).toHaveText('1');
    await expect(projectManagers.getByText('Sam Carter', { exact: true })).toBeVisible();
    await expect(projectManagers.getByText('Morgan Reyes', { exact: true })).toHaveCount(0);

    const otherWorkspaceUsers = page.getByTestId('other-workspace-users-section');
    await expect(otherWorkspaceUsers.getByRole('heading', { name: 'Other workspace users' })).toBeVisible();
    await expect(otherWorkspaceUsers.getByTestId('other-workspace-users-count')).toHaveText('4');
    await expect(otherWorkspaceUsers.getByText('Morgan Reyes', { exact: true })).toBeVisible();
    await expect(otherWorkspaceUsers.getByText('Sam Carter', { exact: true })).toHaveCount(0);
    await expect(page).toHaveScreenshot('desktop-users.png', { animations: 'disabled', maxDiffPixels: 50 });

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

  test('shows scoped empty states when user search has no matches', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/__visual/users');
    await page.getByLabel('Search users').fill('does-not-exist');
    await expect(page.getByText('No Project Managers match your search.')).toBeVisible();
    await expect(page.getByText('No other workspace users match your search.')).toBeVisible();
    await expect(page).toHaveScreenshot('desktop-users-search-empty.png', { animations: 'disabled' });
  });

  test('keeps the shell background continuous on mobile across both tabs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__visual/users');
    await expect(page.getByRole('heading', { name: 'Users & Roles' })).toBeVisible();
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('mobile-users.png', { animations: 'disabled', maxDiffPixels: 50 });

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await assertWorkspaceSurface(page);

    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.getByRole('heading', { name: 'Users & Roles' })).toBeVisible();
    await expect(page.getByText('North Ridge Development')).toBeVisible();
    await assertWorkspaceSurface(page);
    await expect(page).toHaveScreenshot('mobile-clients.png', { animations: 'disabled' });
  });

  test('adds an existing Client user and recovers from a failed client invitation', async ({ page }) => {
    let clientsResponse = structuredClone(clients);
    let inviteAttempts = 0;
    const memberRequests: string[] = [];

    await page.route('**/api/clients', async (route) => {
      await route.fulfill({ json: clientsResponse });
    });
    await page.route('**/api/clients/client-north-ridge/members', async (route) => {
      const body = route.request().postDataJSON() as { userId: string };
      memberRequests.push(body.userId);
      const user = workspaceUsers.find((candidate) => candidate.id === body.userId);
      expect(user).toBeTruthy();
      clientsResponse = clientsResponse.map((client) => client.id === 'client-north-ridge'
        ? {
            ...client,
            members: [...client.members, {
              id: 'client-member-casey',
              userId: user!.id,
              name: user!.name,
              email: user!.email,
              imageUrl: user!.imageUrl,
              role: 'Client',
              addedAt: Date.parse('2026-09-12T15:00:00.000Z'),
            }],
          }
        : client);
      await route.fulfill({ status: 201, json: clientsResponse[0] });
    });
    await page.route('**/api/clients/client-north-ridge/invitations', async (route) => {
      inviteAttempts += 1;
      if (inviteAttempts === 1) {
        await route.fulfill({ status: 502, json: { error: 'Invitation service unavailable. Try again.' } });
        return;
      }
      const body = route.request().postDataJSON() as { email: string };
      const pendingInvitation = {
        id: 'client-invitation-retry',
        email: body.email,
        role: 'Client' as const,
        status: 'pending',
        createdAt: Date.parse('2026-09-12T15:00:00.000Z'),
      };
      clientsResponse = clientsResponse.map((client) => client.id === 'client-north-ridge'
        ? { ...client, pendingInvitations: [...client.pendingInvitations, pendingInvitation] }
        : client);
      await route.fulfill({ status: 201, json: pendingInvitation });
    });

    await page.goto('/__visual/users');
    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.getByText('Pending client invitations')).toBeVisible();
    await expect(page.getByText('pending.client@luminova.test')).toBeVisible();

    await page.getByLabel('Workspace Client user').selectOption('user-casey');
    await page.getByRole('button', { name: 'Add existing user' }).click();
    await expect.poll(() => memberRequests).toEqual(['user-casey']);
    await expect(page.getByText('Client access granted.')).toBeVisible();
    await expect(page.getByText('Casey Brooks', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Invite by email' }).click();
    await page.getByLabel('Email address').fill('new.client@luminova.test');
    await page.getByRole('button', { name: 'Send client invitation' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invitation service unavailable. Try again.');

    await page.getByRole('button', { name: 'Send client invitation' }).click();
    await expect(page.getByText('Client invitation sent to new.client@luminova.test.')).toBeVisible();
    await expect(page.getByText('new.client@luminova.test', { exact: true })).toBeVisible();
    await expect(page.getByText('Invitation pending')).toHaveCount(2);
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
