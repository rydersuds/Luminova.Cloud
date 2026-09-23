import { expect, test, type Locator } from '@playwright/test';

const trades = [{
  id: 'trade-logo',
  companyName: 'Northline Electric',
  contactName: 'Jordan Lee',
  tradeType: 'Electrical',
  specialties: ['Electrical'],
  region: 'Calgary',
  rating: 4.8,
  reviewCount: 3,
  completedJobs: 12,
  initials: 'NE',
  accent: '#c8ae4b',
  profilePhotoUrl: '/api/storage/objects/vendor-logo',
  profilePhotoPositionX: 50,
  profilePhotoPositionY: 50,
  profilePhotoZoom: 1,
}, {
  id: 'trade-person',
  companyName: 'Avery Reid',
  contactName: 'Avery Reid',
  tradeType: 'Carpentry',
  specialties: ['Carpentry'],
  region: 'Calgary',
  rating: 0,
  reviewCount: 0,
  completedJobs: 0,
  initials: 'AR',
  accent: '#4f86c6',
  profilePhotoUrl: null,
  profilePhotoPositionX: 50,
  profilePhotoPositionY: 50,
  profilePhotoZoom: 1,
}];

async function expectImageToLoad(image: Locator, description: string) {
  await expect.poll(
    () => image.evaluate((element) => {
      const candidate = element as HTMLImageElement;
      return candidate.complete && candidate.naturalWidth > 0;
    }),
    {
      message: `${description} did not load; the private logo URL may be missing or inaccessible`,
    },
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
  });
  await page.route('**/api/users/me', route => route.fulfill({
    json: {
      id: 'user-1',
      firstName: 'Maya',
      lastName: 'Chen',
      name: 'Maya Chen',
      email: 'maya@example.com',
      role: 'Project Manager',
      createdAt: 0,
      lastSignInAt: 0,
      imageUrl: '',
    },
  }));
  await page.route('**/api/trades**', route => route.fulfill({ json: trades }));
  await page.route('**/api/storage/objects/vendor-logo', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c8ae4b"/><path d="M12 32h40" stroke="#111" stroke-width="8"/></svg>',
  }));
});

test('renders stored vendor logos and personal-name initials in the Trades directory', async ({ page }) => {
  await page.goto('/__visual/trades');

  await expect(page.getByRole('heading', { name: 'Trades & Vendors Directory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Northline Electric' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avery Reid' })).toBeVisible();

  const logo = page.getByRole('img', { name: 'Northline Electric profile logo' });
  await expect(logo).toBeVisible();
  await expectImageToLoad(logo, 'Northline Electric logo');
  await expect(page.getByText('AR', { exact: true })).toBeVisible();
});