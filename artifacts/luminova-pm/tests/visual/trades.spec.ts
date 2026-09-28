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
}, {
  id: 'trade-broken',
  companyName: 'Broken Image Plumbing',
  contactName: 'Casey Morgan',
  tradeType: 'Plumbing',
  specialties: ['Plumbing'],
  region: 'Calgary',
  rating: 0,
  reviewCount: 0,
  completedJobs: 0,
  initials: 'BI',
  accent: '#9b5de5',
  profilePhotoUrl: '/api/storage/objects/broken-vendor-logo',
  profilePhotoPositionX: 25,
  profilePhotoPositionY: 75,
  profilePhotoZoom: 1.4,
}];

const approvedLogoPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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
    contentType: 'image/png',
    body: approvedLogoPng,
  }));
  await page.route('**/api/storage/objects/broken-vendor-logo', route => route.fulfill({ status: 404 }));
});


test('renders approved logos and initials for missing or failed vendor photos', async ({ page }) => {
  await page.goto('/__visual/trades');

  await expect(page.getByRole('heading', { name: 'Trades & Vendors Directory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Northline Electric' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avery Reid' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Broken Image Plumbing' })).toBeVisible();

  const logo = page.getByRole('img', { name: 'Northline Electric profile logo' });
  await expect(logo).toBeVisible();
  await expectImageToLoad(logo, 'Northline Electric logo');
  await expect(page.getByText('AR', { exact: true })).toBeVisible();
  await expect(page.getByText('BI', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Broken Image Plumbing profile logo' })).toHaveCount(0);
});

test('falls back to initials on the vendor detail page when a private photo fails', async ({ page }) => {
  await page.route('**/api/trades/trade-logo', route => route.fulfill({
    json: {
      ...trades[0],
      phone: '',
      email: '',
      website: '',
      licence: '',
      insurance: '',
      insuranceExpiry: '',
      regions: ['Calgary'],
      sourceNotes: '',
      jobHistory: [],
      reviews: [],
      bids: [],
      profilePhotoUrl: '/api/storage/objects/broken-vendor-logo',
    },
  }));
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));

  await page.goto('/__visual/trade-detail');

  await expect(page.getByRole('heading', { name: 'Northline Electric' })).toBeVisible();
  await expect(page.getByText('NE', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Northline Electric profile logo' })).toHaveCount(0);
});