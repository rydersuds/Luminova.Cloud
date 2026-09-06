import { expect, test } from '@playwright/test';

test.describe('Messages Interface', () => {
  test('desktop layout side-by-side and search filtering', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/messages');
    await expect(page.getByText('City Electric').first()).toBeVisible();
    await expect(page.getByPlaceholder('Transmit message...')).toBeVisible();
    
    // Check initial dark aesthetic and layout
    await expect(page).toHaveScreenshot('desktop-messages-initial.png', { animations: 'disabled' });

    // Filter by search
    const searchInput = page.getByPlaceholder('Search channels & people...');
    await searchInput.fill('Sarah');
    
    await expect(page.getByText('Sarah Jenkins').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open channel for City Electric' })).not.toBeVisible();
    
    // Test empty search
    await searchInput.fill('XYZ nonexistent');
    await expect(page.getByText('No signals found')).toBeVisible();
  });

  test('mobile master-detail navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__visual/messages');
    
    // List should be visible
    await expect(page.getByRole('button', { name: 'Open channel for Downtown Office Reno' })).toBeVisible();
    // Detail should not be visible or at least input hidden
    await expect(page.getByPlaceholder('Transmit message...')).not.toBeVisible();
    await expect(page).toHaveScreenshot('mobile-messages-list.png', { animations: 'disabled' });

    // Click chat to go to detail
    await page.getByRole('button', { name: 'Open channel for Downtown Office Reno' }).click();
    await expect(page.getByPlaceholder('Transmit message...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to conversations' })).toBeVisible();
    await expect(page).toHaveScreenshot('mobile-messages-detail.png', { animations: 'disabled' });

    // Back to list
    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page.getByPlaceholder('Transmit message...')).not.toBeVisible();
  });

  test('message input interactions and appending', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/messages');
    
    const input = page.getByPlaceholder('Transmit message...');
    const sendButton = page.getByRole('button', { name: 'Send message' });

    await expect(sendButton).toBeDisabled();

    const testMessage = 'Are the drywallers coming?';
    await input.fill(testMessage);
    await expect(sendButton).not.toBeDisabled();
    
    await sendButton.click();
    await expect(input).toHaveValue('');
    
    // Check if the message was appended to the list
    await expect(page.getByText(testMessage)).toBeVisible();
    
    const secondMessage = 'Yes they are.';
    await input.fill(secondMessage);
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.getByText(secondMessage)).toBeVisible();
  });

  test('ambient motion disabled on reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/messages');
    
    const animatedBg = page.locator('.animate-pulse').first();
    await expect(animatedBg).toBeVisible();
    await expect(animatedBg).toHaveCSS('animation-name', 'none');
  });
});
