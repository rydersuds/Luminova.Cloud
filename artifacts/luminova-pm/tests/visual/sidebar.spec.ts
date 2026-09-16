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

const assertNoPageHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  await expect.poll(() => page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ))).toBeLessThanOrEqual(0);
};

const assertBackgroundlessSidebarControls = async (page: import('@playwright/test').Page) => {
  const controls = [
    page.locator('[data-contrast-label="profile control"]'),
    page.getByTestId('theme-toggle'),
  ];

  for (const control of controls) {
    await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(control).toHaveCSS('border-top-width', '0px');
    await expect(control).toHaveCSS('border-right-width', '0px');
    await expect(control).toHaveCSS('border-bottom-width', '0px');
    await expect(control).toHaveCSS('border-left-width', '0px');
  }
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
    await assertNoPageHorizontalOverflow(page);
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
    await expect(page.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    await assertBackgroundlessSidebarControls(page);
    await assertNavigationContrast(page, 'desktop profile expanded');
    await expect(page).toHaveScreenshot('desktop-profile-sign-out.png', { animations: 'disabled' });

    await page.locator('[data-contrast-label="profile control"]').hover();
    await assertNavigationContrast(page, 'desktop profile hover');
    await expect(page).toHaveScreenshot('desktop-profile-hover.png', { animations: 'disabled' });

    await page.getByRole('button', { name: 'Sign out' }).hover();
    await assertNavigationContrast(page, 'desktop sign out hover');
    await expect(page).toHaveScreenshot('desktop-sign-out-hover.png', { animations: 'disabled' });
  });

  test('desktop compact rail keeps destinations and profile actions usable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/sidebar?sidebar=compact&active=messages&profile=open');
    await expect(page.getByTestId('app-layout')).toBeVisible();

    const sidebar = page.locator('aside');
    const main = page.locator('main');
    const compactSidebarBox = await sidebar.boundingBox();
    const compactMainBox = await main.boundingBox();
    expect(compactSidebarBox?.width).toBeLessThan(100);
    expect(compactMainBox?.x).toBeGreaterThan((compactSidebarBox?.x ?? 0) + (compactSidebarBox?.width ?? 0));

    const toggle = page.getByTestId('desktop-sidebar-toggle');
    await expect(toggle).toHaveAccessibleName('Expand sidebar');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: 'Communications' })).toHaveAttribute('title', 'Communications');
    await expect(page.getByRole('link', { name: 'Communications' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeInViewport();
    await assertBackgroundlessSidebarControls(page);
    await expect(page).toHaveScreenshot('desktop-compact.png', { animations: 'disabled' });

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAccessibleName('Collapse sidebar');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Communications' })).not.toHaveAttribute('title', 'Communications');
  });

  test('desktop collapse preference survives reload and does not change mobile drawer behavior', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/sidebar?sidebar=expanded');
    const toggle = page.getByTestId('desktop-sidebar-toggle');
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Expand sidebar');

    await page.goto('/__visual/sidebar');
    await expect(page.getByTestId('desktop-sidebar-toggle')).toHaveAccessibleName('Expand sidebar');
    await expect(page.getByRole('link', { name: 'All Projects' })).toHaveAttribute('title', 'All Projects');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    await expect(page.getByTestId('desktop-sidebar-toggle')).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All Projects' })).toBeVisible();
  });

  test('theme toggle applies and persists the dark mode preference', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/sidebar');

    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAccessibleName('Switch to dark mode');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Switch to light mode');
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to light mode');
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('only the surface under the pointer moves its light and reduced motion stays still', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);

    const panel = page.locator('.glass-panel-dark:visible').first();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS('--panel-light-color', 'transparent');
    const panelBounds = await panel.boundingBox();
    if (!panelBounds) throw new Error('Expected a visible reactive panel');
    await page.mouse.move(panelBounds.x + panelBounds.width * 0.72, panelBounds.y + panelBounds.height * 0.28);
    await expect.poll(() => panel.evaluate((element) => ({
      x: element.style.getPropertyValue('--local-light-x'),
      y: element.style.getPropertyValue('--local-light-y'),
    }))).toEqual({ x: '72.0%', y: '28.0%' });
    await expect(panel).not.toHaveCSS('--panel-light-color', 'transparent');

    await page.mouse.move(1296, 810);
    await expect(panel).toHaveCSS('--panel-light-color', 'transparent');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const reducedMotionPanel = page.locator('.glass-panel-dark:visible').first();
    await expect(reducedMotionPanel).toBeVisible();
    const reducedMotionBounds = await reducedMotionPanel.boundingBox();
    if (!reducedMotionBounds) throw new Error('Expected a visible reduced-motion panel');
    await page.mouse.move(reducedMotionBounds.x + reducedMotionBounds.width * 0.5, reducedMotionBounds.y + reducedMotionBounds.height * 0.5);
    await expect(reducedMotionPanel).not.toHaveCSS('--panel-light-color', 'transparent');
    await expect.poll(() => reducedMotionPanel.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('radial-gradient(96px at 76% 22%');
  });

  test('mobile header, drawer, and overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stabilize(page);
    await assertNoPageHorizontalOverflow(page);
    await assertNavigationContrast(page, 'mobile header');
    await expect(page).toHaveScreenshot('mobile-header.png', { animations: 'disabled' });

    await page.goto('/__visual/sidebar?drawer=open&profile=open');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await assertNoPageHorizontalOverflow(page);
    await assertBackgroundlessSidebarControls(page);
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
  const expectIndicatorAligned = async (
    indicator: import('@playwright/test').Locator,
    link: import('@playwright/test').Locator,
  ) => {
    await expect.poll(async () => {
      const [indicatorBox, linkBox] = await Promise.all([
        indicator.boundingBox(),
        link.boundingBox(),
      ]);
      if (!indicatorBox || !linkBox) return Number.POSITIVE_INFINITY;
      const indicatorCenter = indicatorBox.y + indicatorBox.height / 2;
      const linkCenter = linkBox.y + linkBox.height / 2;
      return Math.abs(indicatorCenter - linkCenter);
    }).toBeLessThan(1);
  };

  const expectStagedLanding = async (
    indicator: import('@playwright/test').Locator,
    link: import('@playwright/test').Locator,
    direction: 'up' | 'down',
  ) => {
    await expect(indicator).toHaveAttribute('data-motion-phase', 'travel');
    await expect(indicator).toHaveAttribute('data-motion-direction', direction);
    await expect(indicator).toHaveAttribute('data-last-motion', 'staged');
    await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(0, 0, 0)');
    await expect(indicator).toHaveAttribute('data-motion-phase', 'idle');
    await expectIndicatorAligned(indicator, link);
  };

  test('stages downward and upward desktop route changes after immediate initial positioning', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);

    const indicator = page.getByTestId('sidebar-selection-indicator');
    await expect(indicator).toHaveAttribute('data-animate', 'false');
    await expect(indicator).toHaveAttribute('data-motion-phase', 'idle');
    await expectIndicatorAligned(indicator, page.getByRole('link', { name: 'All Projects' }));

    const communications = page.getByRole('link', { name: 'Communications' });
    await communications.click();
    await expect(communications).toHaveAttribute('aria-current', 'page');
    await expectStagedLanding(indicator, communications, 'down');

    const projects = page.getByRole('link', { name: 'All Projects' });
    await projects.click();
    await expect(projects).toHaveAttribute('aria-current', 'page');
    await expectStagedLanding(indicator, projects, 'up');
  });

  test('uses the same staged motion in both directions in the open mobile drawer', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__visual/sidebar?drawer=open');
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();

    const indicator = page.getByTestId('sidebar-selection-indicator');
    await expect(indicator).toHaveAttribute('data-animate', 'false');
    const quotes = page.getByRole('link', { name: 'Vendor Quotes' });
    await quotes.click();
    await expectStagedLanding(indicator, quotes, 'down');

    const projects = page.getByRole('link', { name: 'All Projects' });
    await projects.click();
    await expectStagedLanding(indicator, projects, 'up');
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
  });

  test('changes selection immediately when reduced motion is preferred', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await stabilize(page);

    const indicator = page.getByTestId('sidebar-selection-indicator');
    const financials = page.getByRole('link', { name: 'Financials' });
    await financials.click();
    await expect(financials).toHaveAttribute('aria-current', 'page');
    await expect(indicator).toHaveAttribute('data-animate', 'false');
    await expect(indicator).toHaveAttribute('data-motion-phase', 'idle');
    await expectIndicatorAligned(indicator, financials);
  });

  test('keeps compact desktop selection aligned through route changes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/sidebar?sidebar=compact');
    await expect(page.getByTestId('desktop-sidebar-toggle')).toHaveAccessibleName('Expand sidebar');

    const indicator = page.getByTestId('sidebar-selection-indicator');
    const messages = page.getByRole('link', { name: 'Communications' });
    await messages.click();
    await expect(messages).toHaveAttribute('aria-current', 'page');
    await expectIndicatorAligned(indicator, messages);

    await page.getByTestId('desktop-sidebar-toggle').click();
    await expect(page.getByTestId('desktop-sidebar-toggle')).toHaveAccessibleName('Collapse sidebar');
    await expectIndicatorAligned(indicator, messages);
  });
});
