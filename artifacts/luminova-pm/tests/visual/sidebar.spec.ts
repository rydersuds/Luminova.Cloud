import { expect, test } from '@playwright/test';

const stabilize = async (page: import('@playwright/test').Page) => {
  await page.goto('/__visual/sidebar');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId('app-layout')).toBeVisible();
};

test.describe('navigation contrast', () => {
  test('desktop active, hover, and shared dark surface', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);
    await expect(page).toHaveScreenshot('desktop-active-dark-surface.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?hover=trades');
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await expect(page).toHaveScreenshot('desktop-hover.png', { animations: 'disabled' });
  });

  test('desktop profile-expanded and sign-out states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/sidebar?profile=open');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page).toHaveScreenshot('desktop-profile-sign-out.png', { animations: 'disabled' });

    await page.getByRole('button', { name: 'Sign out' }).hover();
    await expect(page).toHaveScreenshot('desktop-sign-out-hover.png', { animations: 'disabled' });
  });

  test('mobile header, drawer, and overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stabilize(page);
    await expect(page).toHaveScreenshot('mobile-header.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?drawer=open&profile=open');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page).toHaveScreenshot('mobile-drawer-overlay.png', { animations: 'disabled' });
  });
});