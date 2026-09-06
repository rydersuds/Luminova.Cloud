import { expect, test } from '@playwright/test';

type ContrastResult = {
  label: string;
  ratio: number;
  threshold: number;
  foreground: string;
  background: string;
};

const stabilize = async (page: import('@playwright/test').Page) => {
  await page.goto('/__visual/sidebar');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId('app-layout')).toBeVisible();
};

const assertNavigationContrast = async (
  page: import('@playwright/test').Page,
  state: string,
) => {
  const results = await page.locator('[data-contrast-label]').evaluateAll((elements) => {
    type Rgba = { r: number; g: number; b: number; a: number };

    const parseColor = (value: string): Rgba => {
      const match = value.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\)/);
      if (match) {
        return {
          r: Number(match[1]),
          g: Number(match[2]),
          b: Number(match[3]),
          a: match[4] === undefined ? 1 : Number(match[4]),
        };
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create a canvas color parser');
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    };
    const renderedBackground = (element: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) {
        layers.unshift(parseColor(getComputedStyle(current).backgroundColor));
      }
      return layers.reduce(
        (background, layer) => composite(layer, background),
        { r: 255, g: 255, b: 255, a: 1 },
      );
    };
    const luminance = ({ r, g, b }: Rgba) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const format = ({ r, g, b, a }: Rgba) =>
      `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;

    return elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const indicator = document.querySelector('[data-testid="sidebar-selection-indicator"]');
        const background = element.getAttribute('aria-current') === 'page' && indicator
          ? composite(
              parseColor(getComputedStyle(indicator).backgroundColor),
              renderedBackground(indicator.parentElement ?? indicator),
            )
          : renderedBackground(element);
        const opacity = Number(style.opacity);
        const declaredForeground = parseColor(style.color);
        const foreground = composite(
          { ...declaredForeground, a: declaredForeground.a * opacity },
          background,
        );
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

        return {
          label: element.getAttribute('data-contrast-label') ?? element.tagName.toLowerCase(),
          ratio: (lighter + 0.05) / (darker + 0.05),
          threshold: isLargeText ? 3 : 4.5,
          foreground: format(foreground),
          background: format(background),
        };
      });
  });

  const failures = (results as ContrastResult[]).filter(
    ({ ratio, threshold }) => ratio < threshold,
  );
  expect(
    failures,
    `${state} color contrast failures:\n${failures
      .map(
        ({ label, ratio, threshold, foreground, background }) =>
          `- ${label}: ${ratio.toFixed(2)}:1 (expected at least ${threshold.toFixed(1)}:1); foreground ${foreground}, background ${background}`,
      )
      .join('\n')}`,
  ).toEqual([]);
};

test.describe('navigation contrast', () => {
  test('desktop active, hover, and shared dark surface', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);
    await assertNavigationContrast(page, 'desktop active');
    await expect(page).toHaveScreenshot('desktop-active-dark-surface.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?hover=trades');
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await assertNavigationContrast(page, 'desktop hover');
    await expect(page).toHaveScreenshot('desktop-hover.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?active=messages');
    await expect(page.getByRole('link', { name: 'Communications' })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveScreenshot('desktop-active-messages.png', { animations: 'disabled' });
  });

  test('desktop profile-expanded and sign-out states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/sidebar?profile=open');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await assertNavigationContrast(page, 'desktop profile expanded');
    await expect(page).toHaveScreenshot('desktop-profile-sign-out.png', { animations: 'disabled' });

    await page.locator('[data-contrast-label="profile control"]').hover();
    await assertNavigationContrast(page, 'desktop profile hover');
    await expect(page).toHaveScreenshot('desktop-profile-hover.png', { animations: 'disabled' });

    await page.getByRole('button', { name: 'Sign out' }).hover();
    await assertNavigationContrast(page, 'desktop sign out hover');
    await expect(page).toHaveScreenshot('desktop-sign-out-hover.png', { animations: 'disabled' });
  });

  test('mobile header, drawer, and overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stabilize(page);
    await assertNavigationContrast(page, 'mobile header');
    await expect(page).toHaveScreenshot('mobile-header.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?drawer=open&profile=open');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await assertNavigationContrast(page, 'mobile drawer profile expanded');
    await expect(page).toHaveScreenshot('mobile-drawer-overlay.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?drawer=open&active=quotes');
    await expect(page.getByRole('link', { name: 'Vendor Quotes' })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveScreenshot('mobile-drawer-active-quotes.png', { animations: 'disabled' });
  });

  test('mobile drawer supports keyboard navigation and dismissal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stabilize(page);

    const menuButton = page.getByRole('button', { name: 'Open navigation' });
    await menuButton.focus();
    await page.keyboard.press('Enter');

    const drawer = page.getByRole('dialog', { name: 'Main navigation' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Command Center' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'All Projects' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  });
});

test.describe('navigation selection motion', () => {
  test('positions immediately on load, then animates desktop route changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);

    const indicator = page.getByTestId('sidebar-selection-indicator');
    await expect(indicator).toHaveAttribute('data-animate', 'false');
    await expect(indicator).toHaveCSS('transition-duration', '0s');
    const initialTransform = await indicator.evaluate((element) => getComputedStyle(element).transform);

    await page.getByRole('link', { name: 'Communications' }).click();
    await expect(page.getByRole('link', { name: 'Communications' })).toHaveAttribute('aria-current', 'page');
    await expect(indicator).toHaveAttribute('data-animate', 'true');
    await expect(indicator).toHaveCSS('transition-duration', '0.5s');
    await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transform))
      .not.toBe(initialTransform);
  });

  test('uses the same emphasized motion in the open mobile drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__visual/sidebar?drawer=open');
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();

    const indicator = page.getByTestId('sidebar-selection-indicator');
    await expect(indicator).toHaveAttribute('data-animate', 'false');
    await page.getByRole('link', { name: 'Vendor Quotes' }).click();
    await expect(page.getByRole('link', { name: 'Vendor Quotes' })).toHaveAttribute('aria-current', 'page');
    await expect(indicator).toHaveAttribute('data-animate', 'true');
    await expect(indicator).toHaveCSS('transition-duration', '0.5s');
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
  });

  test('changes selection immediately when reduced motion is preferred', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);

    const indicator = page.getByTestId('sidebar-selection-indicator');
    await page.getByRole('link', { name: 'Financials' }).click();
    await expect(page.getByRole('link', { name: 'Financials' })).toHaveAttribute('aria-current', 'page');
    await expect(indicator).toHaveAttribute('data-animate', 'true');
    await expect(indicator).toHaveCSS('transition-duration', '0s');
  });
});
