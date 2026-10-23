import { expect, test, type Locator } from '@playwright/test';

const trades = [{
  id: 'trade-logo',
  companyName: 'Northline Electric',
  contactName: 'Jordan Lee',
  phone: '+1 (403) 555-0123',
  email: 'office@northline.example',
  sourceNotes: 'Preferred service partner',
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
  phone: '',
  email: '',
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
  await page.route('**/api/trades**', route => {
    const params = new URL(route.request().url()).searchParams;
    const search = params.get('search')?.toLowerCase() ?? '';
    const specialty = params.get('tradeType');
    const result = trades.filter(trade =>
      (!specialty || trade.specialties.includes(specialty)) &&
      (!search || [
        trade.companyName, trade.contactName, trade.tradeType, ...trade.specialties,
        trade.region, trade.phone ?? '', trade.email ?? '', trade.sourceNotes ?? '',
      ].join(' ').toLowerCase().includes(search)),
    );
    return route.fulfill({ json: result });
  });
  await page.route('**/api/storage/objects/vendor-logo', route => route.fulfill({
    contentType: 'image/png',
    body: approvedLogoPng,
  }));
  await page.route('**/api/storage/objects/broken-vendor-logo', route => route.fulfill({ status: 404 }));
});

test('compact rows show direct contacts without reviews or clickable containers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/__visual/trades');
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Northline Electric', exact: true }) });
  await expect(page.getByText('3 vendors', { exact: true })).toBeVisible();
  await expect(row.getByText('Jordan Lee', { exact: true })).toBeVisible();
  await expect(row.getByText('Calgary', { exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Northline Electric', exact: true })).toHaveAttribute('href', '/trades/trade-logo');
  await expect(row.getByRole('link', { name: /Call Northline Electric/ })).toHaveAttribute('href', 'tel:+1 (403) 555-0123');
  await expect(row.getByRole('link', { name: /Email Northline Electric/ })).toHaveAttribute('href', 'mailto:office@northline.example');
  await expect(page.getByText(/verified reviews|jobs completed/)).toHaveCount(0);
  expect((await row.boundingBox())!.height).toBeLessThan(110);
  const missing = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Avery Reid', exact: true }) });
  await expect(missing.getByText('Phone not recorded')).toBeVisible();
  await expect(missing.getByText('Email not recorded')).toBeVisible();
  await expect(missing.getByRole('link')).toHaveCount(1);

  // Suppress OS contact handlers, but let any accidental profile navigation run.
  await page.evaluate(() => document.addEventListener('click', event => {
    const anchor = (event.target as Element).closest('a');
    if (anchor?.href.startsWith('tel:') || anchor?.href.startsWith('mailto:')) event.preventDefault();
  }, true));
  await row.getByRole('link', { name: /Call Northline Electric/ }).click();
  await expect(page).toHaveURL(/\/__visual\/trades$/);
  await row.getByRole('link', { name: /Email Northline Electric/ }).click();
  await expect(page).toHaveURL(/\/__visual\/trades$/);
  await row.getByText('Jordan Lee', { exact: true }).click();
  await expect(page).toHaveURL(/\/__visual\/trades$/);

  const profile = row.getByRole('link', { name: 'Northline Electric', exact: true });
  await profile.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(profile).toBeFocused();
  expect(await profile.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(row.getByRole('link', { name: /Call Northline Electric/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(row.getByRole('link', { name: /Email Northline Electric/ })).toBeFocused();
  await profile.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/trades\/trade-logo$/);
});

test('search passes existing matching fields to the API and specialty stays apparent', async ({ page }) => {
  await page.goto('/__visual/trades');
  const search = page.getByRole('textbox', { name: 'Search vendors' });
  for (const query of ['Northline', 'Jordan', 'Electrical', '403', 'office@northline', 'Preferred service', 'Calgary']) {
    await search.fill(query);
    await expect(page.getByText(query === 'Calgary' ? '3 vendors found' : '1 vendor found', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Northline Electric', exact: true })).toBeVisible();
  }
  await search.fill('');
  await expect(page.getByRole('combobox', { name: 'Trade specialty' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Trade specialty' }).selectOption('Electrical');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('1 vendor found', { exact: true })).toBeVisible();
  await expect(page.getByLabel('1 active filters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear specialty filter: Electrical' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Trade specialty' })).toHaveValue('Electrical');
  await expect(page.getByRole('combobox').locator('option')).toHaveCount(4);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveValue('');
  await page.getByRole('combobox').selectOption('Electrical');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await search.fill('no such vendor');
  await expect(page.getByRole('heading', { name: 'No matching vendors' })).toBeVisible();
  await expect(page.getByText('0 vendors found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByText('3 vendors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox').selectOption('Plumbing');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Clear specialty filter: Plumbing' }).click();
  await expect(page.getByText('3 vendors', { exact: true })).toBeVisible();
});

test('loading, empty directory and failed loading with retry remain distinct', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let state: 'loading' | 'error' | 'ready' = 'loading';
  await page.route('**/api/trades**', async route => {
    if (state === 'loading') await gate;
    return state === 'error'
      ? route.fulfill({ status: 500, json: { error: 'Unavailable' } })
      : route.fulfill({ json: state === 'ready' ? trades : [] });
  });
  await page.goto('/__visual/trades');
  await expect(page.getByLabel('Loading vendors', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No vendors yet' })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'No vendors yet' })).toBeVisible();
  await expect(page.getByText('0 vendors', { exact: true })).toBeVisible();
  state = 'error';
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Unable to load vendors');
  await expect(page.getByRole('heading', { name: 'No vendors yet' })).toHaveCount(0);
  state = 'ready';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('3 vendors', { exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 1440]) {
    test(`compact directory handles long and missing details at ${width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(value => localStorage.setItem('luminova-theme-v2', value), theme);
      const longName = 'NorthlineElectricalAndConstructionServicesWithoutSpaces';
      const longEmail = 'an.extremely.long.vendor.contact.address.for.site.services@northline-construction.example';
      await page.route('**/api/trades**', route => route.fulfill({
        json: [
          { ...trades[0], companyName: longName, email: longEmail, specialties: ['Electrical', 'Lighting', 'LowVoltageAndBuildingAutomationSystems'], contactName: 'Jordan Lee Site Coordination', region: 'Calgary and surrounding communities' },
          { ...trades[1], contactName: ' ', region: '' },
          trades[2],
        ],
      }));
      await page.goto('/__visual/trades');
      const list = page.getByRole('list', { name: 'Vendors', exact: true });
      await expect(list).toBeVisible();
      await expect(page.getByText('BI', { exact: true })).toBeVisible();
      const email = page.getByRole('link', { name: `Email ${longName} at ${longEmail}`, exact: true });
      await expect(email).toContainText(longEmail);
      await expect(email).toHaveAttribute('href', `mailto:${longEmail}`);
      await expect(page.getByText('Not recorded', { exact: true })).toHaveCount(2);
      const bounds = await email.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.height).toBeGreaterThanOrEqual(width < 880 ? 44 : 32);
      const overflow = await list.evaluate(element =>
        [element, ...element.querySelectorAll('*')].filter(node => {
          const candidate = node as HTMLElement;
          // Inline text has no clientWidth, and screen-reader labels are
          // intentionally clipped. Neither is a scrolling layout container.
          return candidate.clientWidth > 1 && getComputedStyle(candidate).position !== 'absolute' &&
            candidate.scrollWidth > candidate.clientWidth + 1;
        })
          .map(node => node.tagName),
      );
      expect(overflow).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 1440) {
        const row = list.getByRole('listitem').first();
        const nameBox = await row.getByRole('heading').boundingBox();
        const contactBox = await row.getByText('Jordan Lee Site Coordination', { exact: true }).boundingBox();
        expect(contactBox!.x).toBeGreaterThan(nameBox!.x + nameBox!.width);
      }
      await expect(list).toHaveScreenshot(`compact-vendors-${theme}-${width}.png`);
    });
  }
}


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