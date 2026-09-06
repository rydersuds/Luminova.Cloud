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
  panoramas: [{
    id: 'pano-1',
    url: 'data:image/png;base64,iVBORw0KGgo=',
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
}

test.beforeEach(async ({ page }) => {
  const current = structuredClone(project);
  await page.route('**/api/projects/riverstone/activity', route => route.fulfill({ json: [] }));
  await page.route('**/api/projects/riverstone', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: current });
      return;
    }
    await route.fallback();
  });
});

test('opens the accessible upload form and validates missing input', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: 'Upload 360°' }).click();

  await expect(page.getByRole('dialog', { name: 'Upload 360° panorama' })).toBeVisible();
  await expect(page.getByLabel('Panorama image')).toBeVisible();
  await expect(page.getByLabel('Label')).toBeVisible();
  await expect(page.getByLabel('Location')).toBeVisible();
  await expect(page.getByLabel('Capture date')).toBeVisible();

  await page.getByRole('button', { name: 'Upload panorama' }).click();
  await expect(page.getByRole('alert')).toHaveText('Add an image, label, location, and capture date.');
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
    url: `data:image/png;base64,${png.toString('base64')}`,
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