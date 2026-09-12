import { expect, test, type Locator, type Page } from '@playwright/test';

const project = {
  id: 'riverstone',
  name: 'Riverstone Residence',
  address: '128 Riverstone View, Calgary, AB',
  region: 'Calgary',
  status: 'In progress',
  progress: 64,
  pmName: 'Maya Chen',
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
  panoramas: [{
    id: 'pano-1',
    url: '/panorama-test-fixture.svg',
    label: 'Week 24',
    location: 'Main floor',
    date: '2026-09-03',
  }],
  activity: [],
};

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function openGallery(page: Page) {
  await page.goto('/__visual/project-panorama');
  await expect(page.getByRole('heading', { name: 'Riverstone Residence' })).toBeVisible();
  await page.getByRole('tab', { name: 'Photos & 360s' }).click();
  const photoCollection = page.getByRole('button', { name: /^Project photos \d+$/ });
  if (await photoCollection.isVisible()) await photoCollection.click();
}

async function openOverview(page: Page) {
  await page.goto('/__visual/project-panorama');
  await expect(page.getByRole('heading', { name: 'Riverstone Residence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entry agreement' })).toBeVisible();
}

async function expectAgreementVisibleAfterTraversal(
  link: Locator,
  agreementName: string,
  direction: 'forward' | 'reverse',
) {
  const withinVisibleScrollRegion = await link.evaluate((element) => {
    const linkRect = element.getBoundingClientRect();
    return linkRect.top >= 0 && linkRect.bottom <= window.innerHeight;
  });

  expect(
    withinVisibleScrollRegion,
    `${agreementName} was outside the visible scroll region during ${direction} traversal`,
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  let current = structuredClone(project);
  await page.addInitScript(() => {
    window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
  });
  await page.route('**/api/storage/uploads/request-url', route => route.fulfill({
    json: {
      uploadURL: 'http://localhost:4173/__panorama-upload',
      objectPath: '/objects/uploads/123e4567-e89b-12d3-a456-426614174000',
    },
  }));
  await page.route('**/__panorama-upload', route => route.fulfill({ status: 200 }));
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: current });
      return;
    }
    await route.fallback();
  });
});

test('shows only the designated entry agreement in the Overview and opens it', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const files = [
    {
      id: 'agreement-1',
      name: 'NOTICE OF AUTHORIZED CONTRACTOR & INSURANCE ACCESS.pdf',
      url: '/api/storage/objects/uploads/entry-agreement',
    },
    {
      id: 'agreement-2',
      name: 'Riverstone-Residence-construction-management-agreement.pdf',
      url: '/api/storage/objects/uploads/riverstone-management-agreement',
    },
  ];
  const current = {
    ...structuredClone(project),
    files: files.map((file) => ({
      ...file,
      relativePath: `Contracts/${file.name}`,
      contentType: 'application/pdf',
      classification: 'contract',
      collection: 'Contracts',
    })),
  };
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', route => route.fulfill({ json: current }));

  await openOverview(page);
  await expect(page.getByText('1 file', { exact: true })).toBeVisible();
  await expect(page.getByText(files[0].name, { exact: true })).toBeVisible();
  await expect(page.getByText(files[1].name, { exact: true })).toHaveCount(0);
  await expect(page.getByText('2 files', { exact: true })).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  const entryAgreementLink = page.getByRole('link', { name: `Open entry agreement ${files[0].name}` });
  await expect(entryAgreementLink).toHaveAttribute('href', files[0].url);
  await expect(entryAgreementLink).toHaveAttribute('target', '_blank');
  await expect(entryAgreementLink).toHaveAttribute('title', files[0].name);
  const newPagePromise = context.waitForEvent('page');
  await entryAgreementLink.click();
  const newPage = await newPagePromise;
  await expect(newPage).toHaveURL(new RegExp(`${files[0].url}$`));
  await newPage.close();
});

for (const viewport of [
  { name: 'narrow', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
]) {
  test(`keeps the entry agreement usable at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const name = 'notice of authorized contractor & insurance access.PDF';
    const entryAgreement = {
      id: 'entry-agreement',
      name,
      relativePath: `Contracts/Executed agreements/${name}`,
      url: '/api/storage/objects/uploads/entry-agreement',
      contentType: 'application/pdf',
      classification: 'contract',
      collection: 'Contracts',
    };
    const current = { ...structuredClone(project), files: [entryAgreement] };
    await page.unroute('**/api/projects/riverstone');
    await page.route('**/api/projects/riverstone', route => route.fulfill({ json: current }));

    await openOverview(page);
    await expect(page.getByText('1 file', { exact: true })).toBeVisible();
    const link = page.getByRole('link', { name: `Open entry agreement ${name}` });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', entryAgreement.url);
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expectAgreementVisibleAfterTraversal(link, name, 'forward');
    const focusStyle = await link.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(focusStyle).not.toBe('none');

    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(link).toBeFocused();
    await expectAgreementVisibleAfterTraversal(link, name, 'reverse');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
}

test('shows a clear Overview empty state when the designated entry agreement is missing', async ({ page }) => {
  const unrelatedContract = {
    id: 'agreement-2',
    name: 'Riverstone-Residence-construction-management-agreement.pdf',
    relativePath: 'Contracts/Riverstone-Residence-construction-management-agreement.pdf',
    url: '/api/storage/objects/uploads/riverstone-management-agreement',
    contentType: 'application/pdf',
    classification: 'contract',
    collection: 'Contracts',
  };
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', route => route.fulfill({
    json: { ...structuredClone(project), files: [unrelatedContract] },
  }));

  await openOverview(page);
  await expect(page.getByText('No entry agreement is available.', { exact: true })).toBeVisible();
  await expect(page.getByText('Import the authorized contractor and insurance access notice to make it available here.', { exact: true })).toBeVisible();
  await expect(page.getByText(unrelatedContract.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText('1 file', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open entry agreement/ })).toHaveCount(0);
});

test('selects a standard photo as the exterior photo and keeps it selected after refresh', async ({ page }) => {
  let current = {
    ...structuredClone(project),
    photos: [
      { id: 'photo-1', url: '/site-front.jpg', caption: 'Front elevation', phase: 'Exterior', date: '2026-09-04', visualCaption: 'Front exterior elevation.', visualTags: ['front elevation', 'exterior'] },
      { id: 'photo-2', url: '/site-rear.jpg', caption: 'Rear elevation', phase: 'Exterior', date: '2026-09-05', visualCaption: 'Rear exterior elevation.', visualTags: ['rear elevation', 'exterior'] },
    ],
  };
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ exteriorImage: '/site-front.jpg' });
      current = { ...current, exteriorImage: '/site-front.jpg' };
      await route.fulfill({ json: current });
      return;
    }
    await route.fulfill({ json: current });
  });

  await openGallery(page);
  await page.getByRole('button', { name: 'Make Front elevation exterior photo' }).click();
  await expect(page.getByText('Exterior photo updated', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Front elevation as exterior photo' })).toBeEnabled();
  await expect(page.getByText('Exterior photo', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Photos & 360s' }).click();
  await page.getByRole('button', { name: 'Project photos 2' }).click();
  await expect(page.getByRole('button', { name: 'Remove Front elevation as exterior photo' })).toBeEnabled();

  await page.route('**/api/projects', route => route.fulfill({ json: [current] }));
  await page.route('**/api/dashboard/summary', route => route.fulfill({
    json: {
      activeProjects: 1,
      awaitingApproval: 0,
      unreadMessages: 0,
      new360Photos: 0,
      budgeted: current.budgeted,
      invoiced: current.invoiced,
      recentActivity: [],
    },
  }));
  await page.goto('/__visual/project-cards');
  await expect(page.getByRole('img', { name: 'Riverstone Residence' })).toHaveAttribute('src', '/site-front.jpg');
  await page.goto('/__visual/dashboard-cards');
  await expect(page.getByRole('img', { name: 'Riverstone Residence' })).toHaveAttribute('src', '/site-front.jpg');
});

test('reports exterior photo update failures and allows retry', async ({ page }) => {
  const current = {
    ...structuredClone(project),
    photos: [{ id: 'photo-1', url: '/site-front.jpg', caption: 'Front elevation', phase: 'Exterior', date: '2026-09-04', visualCaption: 'Front exterior elevation.', visualTags: ['front elevation', 'exterior'] }],
  };
  let attempts = 0;
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'PATCH') {
      attempts += 1;
      await route.fulfill(attempts === 1 ? { status: 500, json: { error: 'Save failed' } } : { json: { ...current, exteriorImage: '/site-front.jpg' } });
      return;
    }
    await route.fulfill({ json: attempts > 1 ? { ...current, exteriorImage: '/site-front.jpg' } : current });
  });

  await openGallery(page);
  const choose = page.getByRole('button', { name: 'Make Front elevation exterior photo' });
  await choose.click();
  await expect(page.getByRole('alert')).toHaveText('Could not make Front elevation the exterior photo. Try again.');
  await expect(choose).toBeEnabled();
  await choose.click();
  await expect(page.getByRole('button', { name: 'Remove Front elevation as exterior photo' })).toBeEnabled();
});

test('opens the accessible upload form and validates missing input', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: 'Upload 360°' }).click();

  await expect(page.getByRole('dialog', { name: 'Upload 360° panorama' })).toBeVisible();
  await expect(page.getByLabel('Panorama image')).toBeVisible();
  await expect(page.getByLabel('Label (optional)')).toBeVisible();
  await expect(page.getByLabel('Location (optional)')).toBeVisible();
  await expect(page.getByLabel('Capture date (optional)')).toBeVisible();

  await page.getByRole('button', { name: 'Upload panorama' }).click();
  await expect(page.getByRole('alert')).toHaveText('Add a panorama image.');
});

test('reports upload failures', async ({ page }) => {
  await page.route('**/api/projects/riverstone/panoramas', route => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'The panorama image could not be processed.' }),
  }));
  await openGallery(page);
  await page.getByRole('button', { name: 'Upload 360°' }).click();
  await page.getByLabel('Panorama image').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel('Label').fill('Week 25');
  await page.getByLabel('Location').fill('Great room');
  await page.getByLabel('Capture date').fill('2026-09-06');
  await page.getByRole('button', { name: 'Upload panorama' }).click();

  await expect(page.getByRole('alert')).toContainText('The panorama image could not be processed.');
  await expect(page.getByRole('dialog', { name: 'Upload 360° panorama' })).toBeVisible();
});

test('shows an empty schedule state and validates unsupported schedule files', async ({ page }) => {
  await openOverview(page);
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByText('No schedule images yet', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Photos & 360s' }).click();
  await expect(page.getByRole('heading', { name: 'Schedule' })).not.toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Upload schedule image' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Upload schedule image' })).toBeVisible();
  await page.locator('#schedule-image').setInputFiles({
    name: 'master-schedule.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toHaveText('Choose a JPEG, PNG, or WebP schedule image.');
  await expect(page.getByRole('dialog', { name: 'Upload schedule image' })).toBeVisible();
});

test('renders imported schedule images with their paths and full-image link', async ({ page }) => {
  const current = {
    ...structuredClone(project),
    scheduleImages: [{
      id: 'schedule-imported',
      url: '/api/storage/objects/uploads/imported-schedule',
      name: 'master-schedule.png',
      relativePath: 'Schedules/master-schedule.png',
      contentType: 'image/png',
      size: 2048,
    }],
  };
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', route => route.fulfill({ json: current }));

  await openOverview(page);
  await expect(page.getByRole('img', { name: 'master-schedule.png' })).toBeVisible();
  await expect(page.getByText('Schedules/master-schedule.png', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open full image' }).first()).toHaveAttribute(
    'href',
    '/api/storage/objects/uploads/imported-schedule',
  );
  await page.getByRole('button', { name: 'Open schedule image master-schedule.png' }).click();
  await expect(page.getByRole('dialog')).toContainText('Schedules/master-schedule.png');
});

test('uploads a schedule image, refreshes the project, and supports retry after failure', async ({ page }) => {
  const uploaded = {
    id: 'schedule-new',
    url: '/api/storage/objects/uploads/schedule-new',
    name: 'lookahead.png',
    relativePath: 'lookahead.png',
    contentType: 'image/png',
    size: png.length,
  };
  let current = structuredClone(project);
  let attempts = 0;
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', route => route.fulfill({ json: current }));
  await page.route('**/api/projects/riverstone/schedule-images', async route => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 500, json: { error: 'The schedule image could not be saved.' } });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({
      objectPath: '/objects/uploads/123e4567-e89b-12d3-a456-426614174000',
      name: uploaded.name,
      size: png.length,
      contentType: 'image/png',
    });
    current = { ...current, scheduleImages: [uploaded] };
    await route.fulfill({ status: 201, json: uploaded });
  });

  await openOverview(page);
  await page.getByRole('button', { name: 'Upload schedule image' }).first().click();
  await page.locator('#schedule-image').setInputFiles({
    name: uploaded.name,
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByRole('button', { name: 'Upload schedule image' }).last().click();
  await expect(page.getByRole('alert')).toContainText('The schedule image could not be saved.');
  await expect(page.getByRole('dialog', { name: 'Upload schedule image' })).toBeVisible();

  await page.getByRole('button', { name: 'Upload schedule image' }).last().click();
  await expect(page.getByRole('dialog', { name: 'Upload schedule image' })).not.toBeVisible();
  await expect(page.getByText('Schedule image uploaded', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'lookahead.png' })).toBeVisible();
});

test.describe('responsive schedule images', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps multiple schedule images within the narrow project view', async ({ page }) => {
    const current = {
      ...structuredClone(project),
      scheduleImages: [1, 2, 3].map((index) => ({
        id: `schedule-${index}`,
        url: `/schedule-${index}.png`,
        name: `schedule-${index}.png`,
        relativePath: `Schedules/schedule-${index}.png`,
        contentType: 'image/png',
        size: 2048,
      })),
    };
    await page.unroute('**/api/projects/riverstone');
    await page.route('**/api/projects/riverstone', route => route.fulfill({ json: current }));
    await openOverview(page);
    await expect(page.getByRole('img', { name: 'schedule-1.png' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});

test('uploads, refreshes the gallery, and opens the new panorama', async ({ page }) => {
  const uploaded = {
    id: 'pano-new',
    url: '/panorama-test-fixture.svg',
    label: 'Week 25',
    location: 'Great room',
    date: '2026-09-06',
  };
  let current = structuredClone(project);
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: current });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/riverstone/panoramas', async route => {
    expect(route.request().postDataJSON()).toEqual({
      objectPath: '/objects/uploads/123e4567-e89b-12d3-a456-426614174000',
      label: uploaded.label,
      location: uploaded.location,
      date: uploaded.date,
    });
    current = { ...current, panoramas: [...current.panoramas, uploaded] };
    await route.fulfill({ status: 201, json: uploaded });
  });

  await openGallery(page);
  await page.getByRole('button', { name: 'Upload 360°' }).click();
  await page.getByLabel('Panorama image').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Selected panorama preview')).toBeVisible();
  await page.getByLabel('Label').fill(uploaded.label);
  await page.getByLabel('Location').fill(uploaded.location);
  await page.getByLabel('Capture date').fill(uploaded.date);
  await page.getByRole('button', { name: 'Upload panorama' }).click();

  await expect(page.getByRole('dialog', { name: 'Upload 360° panorama' })).not.toBeVisible();
  await expect(page.getByText('360° panorama uploaded', { exact: true })).toBeVisible();
  const newCard = page.getByRole('button', { name: /Week 25/ });
  await expect(newCard).toBeVisible();
  await newCard.click();
  await expect(page.getByRole('dialog')).toContainText('Week 25');
});

test('uploads an image without details and shows accessible fallbacks', async ({ page }) => {
  const uploaded = {
    id: 'pano-image-only',
    url: '/panorama-test-fixture.svg',
    label: null,
    location: null,
    date: null,
  };
  let current = structuredClone(project);
  await page.unroute('**/api/projects/riverstone');
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: current });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/riverstone/panoramas', async route => {
    expect(route.request().postDataJSON()).toEqual({
      objectPath: '/objects/uploads/123e4567-e89b-12d3-a456-426614174000',
    });
    current = { ...current, panoramas: [...current.panoramas, uploaded] };
    await route.fulfill({ status: 201, json: uploaded });
  });

  await openGallery(page);
  await page.getByRole('button', { name: 'Upload 360°' }).click();
  await page.getByLabel('Panorama image').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Upload panorama' }).click();

  await expect(page.getByText('Untitled panorama is now available in the project gallery.', { exact: true })).toBeVisible();
  const newCard = page.getByRole('button', { name: /Untitled panorama/ });
  await expect(newCard).toContainText('Location not provided');
  await expect(newCard).toContainText('Capture date not provided');
  await expect(newCard.getByAltText('360° panorama: Untitled panorama')).toBeVisible();
  await newCard.click();
  await expect(page.getByRole('dialog', { name: 'Untitled panorama 360 degree panorama' })).toBeVisible();
  await expect(page.getByRole('application', { name: /360 degree viewer for Untitled panorama/ })).toBeVisible();
});

test('explores the full spherical panorama with drag, keyboard, and zoom controls', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: /Week 24/ }).click();

  const viewer = page.getByRole('application', { name: /360 degree viewer for Week 24/ });
  await expect(viewer).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer).toContainText('Drag or use arrow keys to look around');
  await expect(viewer).toHaveAttribute('data-view-yaw', '0.0');
  await expect(viewer).toHaveAttribute('data-view-pitch', '0.0');
  await expect(viewer).toHaveAttribute('data-field-of-view', '1.15');
  await expect(page.getByRole('dialog', { name: 'Week 24 360 degree panorama' })).toBeVisible();

  const initialCanvas = await viewer.locator('canvas').screenshot();
  const box = await viewer.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.75, { steps: 5 });
  await page.mouse.up();
  await expect(viewer).not.toHaveAttribute('data-view-yaw', '0.0');
  await expect(viewer).not.toHaveAttribute('data-view-pitch', '0.0');
  const draggedCanvas = await viewer.locator('canvas').screenshot();
  expect(draggedCanvas.equals(initialCanvas)).toBe(false);

  await viewer.hover();
  await page.mouse.wheel(0, -200);
  await expect(viewer).not.toHaveAttribute('data-field-of-view', '1.15');

  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  await expect(zoomIn).toBeVisible();
  await expect(zoomOut).toBeVisible();
  const fieldOfViewBeforeKeyboard = await viewer.getAttribute('data-field-of-view');
  await zoomIn.focus();
  await page.keyboard.press('Enter');
  await expect(viewer).not.toHaveAttribute('data-field-of-view', fieldOfViewBeforeKeyboard!);

  const yawBeforeTouch = await viewer.getAttribute('data-view-yaw');
  await viewer.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 700, clientY: 300 });
  await viewer.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: 520, clientY: 220 });
  await viewer.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: 520, clientY: 220 });
  await expect(viewer).not.toHaveAttribute('data-view-yaw', yawBeforeTouch!);

  await viewer.focus();
  await viewer.press('ArrowRight');
  await viewer.press('ArrowUp');
  await expect(viewer).toBeFocused();
  await expect(viewer).toHaveAttribute('aria-label', /use the arrow keys/);

  for (let index = 0; index < 40; index += 1) await viewer.press('ArrowRight');
  const wrappedYaw = Number(await viewer.getAttribute('data-view-yaw'));
  expect(wrappedYaw).toBeGreaterThanOrEqual(0);
  expect(wrappedYaw).toBeLessThan(360);

  const dialogBox = await page.getByRole('dialog').boundingBox();
  expect(dialogBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(dialogBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

  await page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await page.getByRole('button', { name: /Week 24/ }).click();
  const reopenedViewer = page.getByRole('application', { name: /360 degree viewer for Week 24/ });
  await expect(reopenedViewer).toHaveAttribute('data-render-status', 'ready');
  await expect(reopenedViewer).toHaveAttribute('data-view-yaw', '0.0');
  await expect(reopenedViewer).toHaveAttribute('data-view-pitch', '0.0');
  await expect(reopenedViewer).toHaveAttribute('data-field-of-view', '1.15');
});

test('restores the panorama and complete view after WebGL context loss', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: /Week 24/ }).click();

  const viewer = page.getByRole('application', { name: /360 degree viewer for Week 24/ });
  await expect(viewer).toHaveAttribute('data-render-status', 'ready');
  await viewer.focus();
  await viewer.press('ArrowRight');
  await viewer.press('ArrowUp');
  await viewer.hover();
  await page.mouse.wheel(0, -200);
  const yaw = await viewer.getAttribute('data-view-yaw');
  const pitch = await viewer.getAttribute('data-view-pitch');
  const fieldOfView = await viewer.getAttribute('data-field-of-view');

  const supportsContextLoss = await viewer.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    window.setTimeout(() => extension.restoreContext(), 50);
    return true;
  });
  expect(supportsContextLoss).toBe(true);

  await expect(viewer).toHaveAttribute('data-render-status', 'restoring');
  await expect(viewer.getByRole('status')).toHaveText('Restoring panorama…');
  await expect(viewer).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer).toHaveAttribute('data-view-yaw', yaw!);
  await expect(viewer).toHaveAttribute('data-view-pitch', pitch!);
  await expect(viewer).toHaveAttribute('data-field-of-view', fieldOfView!);
  await expect(page.getByRole('dialog', { name: 'Week 24 360 degree panorama' })).toBeVisible();
});

test('contains a renderer startup failure and can reopen the panorama', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let failNextWebGlStartup = true;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (args[0] === 'webgl' && failNextWebGlStartup) {
        failNextWebGlStartup = false;
        throw new Error('Simulated panorama renderer startup failure');
      }
      return originalGetContext.apply(this, args as Parameters<typeof originalGetContext>);
    } as typeof originalGetContext;
  });

  await openGallery(page);
  await page.getByRole('button', { name: /Week 24/ }).click();

  const failedViewer = page.getByRole('application', { name: /360 degree viewer for Week 24/ });
  await expect(failedViewer).toHaveAttribute('data-render-status', 'error');
  await expect(page.getByRole('alert')).toHaveText(
    'This panorama could not be rendered. Try closing it and opening it again.',
  );
  await expect(page.getByRole('dialog', { name: 'Week 24 360 degree panorama' })).toBeVisible();
  expect(pageErrors).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(failedViewer).not.toBeVisible();
  await page.getByRole('button', { name: /Week 24/ }).click();

  const reopenedViewer = page.getByRole('application', { name: /360 degree viewer for Week 24/ });
  await expect(reopenedViewer).toHaveAttribute('data-render-status', 'ready');
  expect(pageErrors).toEqual([]);
});

test.describe('mobile panorama controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('supports touch dragging and pinch zoom in the responsive dialog', async ({ page }) => {
    await openGallery(page);
    await page.getByRole('button', { name: /Week 24/ }).click();

    const viewer = page.getByRole('application', { name: /360 degree viewer for Week 24/ });
    await expect(viewer).toHaveAttribute('data-render-status', 'ready');
    const box = await viewer.boundingBox();
    expect(box).not.toBeNull();

    const client = await page.context().newCDPSession(page);
    const startX = box!.x + box!.width * 0.75;
    const startY = box!.y + box!.height * 0.65;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box!.x + box!.width * 0.25, y: box!.y + box!.height * 0.3 }],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(viewer).not.toHaveAttribute('data-view-yaw', '0.0');
    await expect(viewer).not.toHaveAttribute('data-view-pitch', '0.0');

    const fieldOfViewBeforePinch = await viewer.getAttribute('data-field-of-view');
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: box!.x + box!.width * 0.35, y: box!.y + box!.height * 0.5 },
        { x: box!.x + box!.width * 0.65, y: box!.y + box!.height * 0.5 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: box!.x + box!.width * 0.2, y: box!.y + box!.height * 0.5 },
        { x: box!.x + box!.width * 0.8, y: box!.y + box!.height * 0.5 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(viewer).not.toHaveAttribute('data-field-of-view', fieldOfViewBeforePinch!);

    const dialogBox = await page.getByRole('dialog').boundingBox();
    expect(dialogBox!.width).toBeLessThanOrEqual(390);
    expect(dialogBox!.height).toBeLessThanOrEqual(844);
  });
});
