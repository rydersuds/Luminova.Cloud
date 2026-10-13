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

test('vendor Message action opens contact email and is disabled when none is recorded', async ({ page }) => {
  let email = '';
  await page.route('**/api/trades/trade-logo', route => route.fulfill({
    json: {
      ...trades[0], email, phone: '', website: '', licence: '', insurance: '', insuranceExpiry: '',
      regions: ['Calgary'], sourceNotes: 'Imported from the approved vendor directory.', jobHistory: [], reviews: [], bids: [],
    },
  }));
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));
  await page.goto('/__visual/trade-detail');
  await expect(page.getByRole('button', { name: 'Message', exact: true })).toBeDisabled();
  await expect(page.getByText('Imported from the approved vendor directory.', { exact: true })).toBeHidden();
  await page.locator('summary').filter({ hasText: 'Source notes' }).click();
  await expect(page.getByText('Imported from the approved vendor directory.', { exact: true })).toBeVisible();
  email = 'office@northline.example';
  await page.reload();
  await expect(page.getByRole('link', { name: 'Message', exact: true })).toHaveAttribute('href', `mailto:${email}`);
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
  await expect(page.getByRole('button', { name: 'Delete Vendor' })).toHaveCount(0);
  await expect(page.getByText('NE', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Northline Electric profile logo' })).toHaveCount(0);
});

test('administrator can remove only the vendor profile and gets directory feedback', async ({ page }) => {
  await page.route('**/api/users/me', route => route.fulfill({
    json: {
      id: 'admin-1', firstName: 'Maya', lastName: 'Chen', name: 'Maya Chen', email: 'maya@example.com',
      role: 'Admin', createdAt: 0, lastSignInAt: 0, imageUrl: '',
    },
  }));
  await page.route('**/api/trades/trade-logo', route => {
    if (route.request().method() === 'DELETE') {
      expect(route.request().postDataJSON()).toEqual({ deletionMode: 'profile_only' });
      return route.fulfill({ json: { deleted: true, relatedRecordsDeleted: false } });
    }
    return route.fulfill({
      json: {
        ...trades[0], phone: '', email: '', website: '', licence: '', insurance: '', insuranceExpiry: '',
        regions: ['Calgary'], sourceNotes: '', jobHistory: [], reviews: [], bids: [],
      },
    });
  });
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));

  await page.goto('/__visual/trade-detail');
  await page.getByRole('button', { name: 'Delete Vendor' }).click();
  await expect(page.getByRole('dialog')).toContainText('Keep this vendor’s quotes, job history, and reviews as historical records.');
  await page.getByRole('button', { name: 'Remove profile' }).click();

  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByRole('status')).toContainText('Related quotes and work history were kept.');
});

test('administrator sees a clear error when vendor deletion fails', async ({ page }) => {
  await page.route('**/api/users/me', route => route.fulfill({
    json: {
      id: 'admin-1', firstName: 'Maya', lastName: 'Chen', name: 'Maya Chen', email: 'maya@example.com',
      role: 'Admin', createdAt: 0, lastSignInAt: 0, imageUrl: '',
    },
  }));
  await page.route('**/api/trades/trade-logo', route => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 500, json: { error: 'The vendor profile could not be deleted. No changes were saved.' } });
    }
    return route.fulfill({
      json: {
        ...trades[0], phone: '', email: '', website: '', licence: '', insurance: '', insuranceExpiry: '',
        regions: ['Calgary'], sourceNotes: '', jobHistory: [], reviews: [], bids: [],
      },
    });
  });
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));

  await page.goto('/__visual/trade-detail');
  await page.getByRole('button', { name: 'Delete Vendor' }).click();
  await page.getByRole('button', { name: 'Remove profile' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'The vendor profile could not be deleted. No changes were saved.',
  );
  await expect(page).toHaveURL(/\/__visual\/trade-detail$/);
});

test('administrator must confirm permanent deletion of vendor records', async ({ page }) => {
  let deletionMode = '';
  await page.route('**/api/users/me', route => route.fulfill({
    json: {
      id: 'admin-1', firstName: 'Maya', lastName: 'Chen', name: 'Maya Chen', email: 'maya@example.com',
      role: 'Admin', createdAt: 0, lastSignInAt: 0, imageUrl: '',
    },
  }));
  await page.route('**/api/trades/trade-logo', route => {
    if (route.request().method() === 'DELETE') {
      deletionMode = route.request().postDataJSON().deletionMode;
      return route.fulfill({ json: { deleted: true, relatedRecordsDeleted: true } });
    }
    return route.fulfill({
      json: {
        ...trades[0], phone: '', email: '', website: '', licence: '', insurance: '', insuranceExpiry: '',
        regions: ['Calgary'], sourceNotes: '', jobHistory: [], reviews: [], bids: [],
      },
    });
  });
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));

  await page.goto('/__visual/trade-detail');
  await page.getByRole('button', { name: 'Delete Vendor' }).click();
  await page.getByRole('radio', { name: /Delete profile and related records/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation.getByRole('heading', { name: 'Delete related vendor records permanently?' })).toBeVisible();
  await expect(confirmation).toContainText('Projects, import batches, project files, invoices, and other vendors will remain.');
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmation).toBeHidden();
  expect(deletionMode).toBe('');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Delete profile and records' }).click();
  await expect.poll(() => deletionMode).toBe('profile_and_related_records');
  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByRole('status')).toContainText('related quotes, job history, and reviews were deleted.');
});