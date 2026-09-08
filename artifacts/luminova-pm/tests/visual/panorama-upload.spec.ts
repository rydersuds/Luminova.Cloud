import { expect, test, type Page } from '@playwright/test';

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

test.beforeEach(async ({ page }) => {
  let current = structuredClone(project);
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
