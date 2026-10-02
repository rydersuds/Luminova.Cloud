import { expect, test } from '@playwright/test';

const conversations = [
  {
    id: 'city-electric',
    projectId: 'downtown',
    projectName: 'Downtown Office Reno',
    title: 'City Electric',
    type: 'direct',
    context: 'Trade',
    participants: [
      { id: 'me', name: 'Alex Morgan', email: 'alex@example.com', imageUrl: '', role: 'Project Manager' },
      { id: 'trade', name: 'City Electric', email: 'city@example.com', imageUrl: '', role: 'Field Team' },
    ],
    createdAt: '2026-09-09T15:00:00.000Z',
    updatedAt: '2026-09-09T16:42:00.000Z',
    messages: [
      { id: 'message-1', conversationId: 'city-electric', projectId: 'downtown', senderId: 'me', sender: { id: 'me', name: 'Alex Morgan', email: 'alex@example.com', imageUrl: '', role: 'Project Manager' }, text: 'Hey, are the framing guys done on floor 2?', createdAt: '2026-09-09T15:15:00.000Z' },
      { id: 'message-2', conversationId: 'city-electric', projectId: 'downtown', senderId: 'trade', sender: { id: 'trade', name: 'City Electric', email: 'city@example.com', imageUrl: '', role: 'Field Team' }, text: "We'll be on site at 7am tomorrow.", createdAt: '2026-09-09T16:42:00.000Z' },
    ],
  },
  {
    id: 'downtown-office',
    projectId: 'downtown',
    projectName: 'Downtown Office Reno',
    title: 'Downtown Office Reno',
    type: 'project',
    context: 'Project Channel',
    participants: [
      { id: 'me', name: 'Alex Morgan', email: 'alex@example.com', imageUrl: '', role: 'Project Manager' },
      { id: 'trade', name: 'City Electric', email: 'city@example.com', imageUrl: '', role: 'Field Team' },
    ],
    createdAt: '2026-09-08T15:00:00.000Z',
    updatedAt: '2026-09-08T16:00:00.000Z',
    messages: [
      { id: 'message-3', conversationId: 'downtown-office', projectId: 'downtown', senderId: 'trade', sender: { id: 'trade', name: 'City Electric', email: 'city@example.com', imageUrl: '', role: 'Field Team' }, text: 'Client approved the lighting change.', createdAt: '2026-09-08T16:00:00.000Z' },
    ],
  },
  {
    id: 'sarah-jenkins',
    projectId: 'riverstone',
    projectName: 'Riverstone Clinic',
    title: 'Sarah Jenkins',
    type: 'direct',
    context: 'Client',
    participants: [
      { id: 'me', name: 'Alex Morgan', email: 'alex@example.com', imageUrl: '', role: 'Project Manager' },
      { id: 'sarah', name: 'Sarah Jenkins', email: 'sarah@example.com', imageUrl: '', role: 'Client' },
    ],
    createdAt: '2026-09-07T15:00:00.000Z',
    updatedAt: '2026-09-07T16:00:00.000Z',
    messages: [
      { id: 'message-4', conversationId: 'sarah-jenkins', projectId: 'riverstone', senderId: 'sarah', sender: { id: 'sarah', name: 'Sarah Jenkins', email: 'sarah@example.com', imageUrl: '', role: 'Client' }, text: 'Thanks for the update!', createdAt: '2026-09-07T16:00:00.000Z' },
    ],
  },
];

test.describe('Messages Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/users/me', route => route.fulfill({ json: { userId: 'me', role: 'Project Manager' } }));
    await page.addInitScript(() => {
      window.localStorage.setItem('luminova-cookie-consent-v1', 'accepted');
    });
    await page.route('**/api/conversations/options', async (route) => {
      await route.fulfill({ json: {
        currentUserId: 'me',
        participants: [
          { id: 'trade', name: 'City Electric', email: 'city@example.com', imageUrl: '', role: 'Field Team' },
          { id: 'sarah', name: 'Sarah Jenkins', email: 'sarah@example.com', imageUrl: '', role: 'Client' },
        ],
        projects: [
          { id: 'downtown', name: 'Downtown Office Reno', clientName: 'Acme', eligibleParticipantIds: ['trade'] },
        ],
      } });
    });
    await page.route('**/api/conversations', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: conversations });
        return;
      }
      await route.fallback();
    });
    await page.route('**/api/conversations/*/messages', async (route) => {
      const conversationId = route.request().url().split('/').at(-2)!;
      const body = route.request().postDataJSON() as { text: string };
      const conversation = conversations.find((item) => item.id === conversationId)!;
      const created = {
        id: `message-${Date.now()}`,
        conversationId,
        projectId: conversation.projectId,
        senderId: 'me',
        sender: { id: 'me', name: 'Alex Morgan', email: 'alex@example.com', imageUrl: '', role: 'Project Manager' },
        text: body.text,
        createdAt: new Date().toISOString(),
      };
      conversation.messages.push(created);
      conversation.updatedAt = created.createdAt;
      await route.fulfill({ status: 201, json: created });
    });
  });

  test('project context opens only the matching channels and keeps drafts with their conversation', async ({ page }) => {
    await page.goto('/__visual/messages?projectId=downtown');
    await expect(page.getByTestId('messages-project-context')).toContainText('Downtown Office Reno');
    await expect(page.getByRole('button', { name: 'Open channel for Sarah Jenkins' })).toHaveCount(0);
    await page.getByTestId('button-new-conversation').click();
    await expect(page.getByTestId('input-channel-title')).toHaveValue('Downtown Office Reno updates');
    await page.keyboard.press('Escape');
    await page.goto('/__visual/messages');
    await page.getByRole('button', { name: 'Open channel for Downtown Office Reno' }).click();
    await page.getByTestId('input-message').fill('Draft for Downtown only');
    await page.getByRole('button', { name: 'Open channel for Sarah Jenkins' }).click();
    await expect(page.getByTestId('input-message')).toHaveValue('');
    await page.getByTestId('input-message').fill('Draft for Sarah only');
    await page.getByRole('button', { name: 'Open channel for Downtown Office Reno' }).click();
    await expect(page.getByTestId('input-message')).toHaveValue('Draft for Downtown only');
    await page.getByRole('button', { name: 'Open channel for Sarah Jenkins' }).click();
    await expect(page.getByTestId('input-message')).toHaveValue('Draft for Sarah only');
    await page.goBack();
    await expect(page.getByTestId('input-message')).toHaveValue('Draft for Downtown only');
  });

  test('an unavailable directed conversation never selects another recipient, including on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__visual/messages?conversation=not-accessible');
    await expect(page.getByRole('alert').filter({ hasText: 'This conversation is unavailable' }).last()).toBeVisible();
    await expect(page.getByTestId('input-message')).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose a conversation' }).click();
    await page.getByRole('button', { name: 'Open channel for Sarah Jenkins' }).click();
    await expect(page.getByTestId('input-message')).toBeVisible();
  });

  test('creates direct and project conversations with accessible controls', async ({ page }) => {
    await page.route('**/api/conversations', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: {
          id: body.type === 'direct' ? 'new-direct' : 'new-project',
          type: body.type,
          projectId: body.projectId ?? null,
          projectName: body.projectId ? 'Downtown Office Reno' : null,
          title: body.title ?? 'City Electric',
          context: body.type === 'direct' ? 'Direct chat' : 'Project chat',
          participants: [
            { id: 'me', name: 'Alex Morgan', email: 'alex@example.com', imageUrl: '', role: 'Project Manager' },
            { id: 'trade', name: 'City Electric', email: 'city@example.com', imageUrl: '', role: 'Field Team' },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        } });
        return;
      }
      await route.fallback();
    });
    await page.goto('/__visual/messages');
    await page.getByTestId('button-new-conversation').click();
    await page.getByTestId('button-select-participants').click();
    await page.getByTestId('item-participant-trade').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('button-submit-create').click();
    await expect(page).toHaveURL(/conversation=new-direct/);

    await page.goto('/__visual/messages');
    await page.getByTestId('button-new-conversation').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('tab-type-project').click();
    await page.getByLabel('Search projects').fill('Downtown');
    await page.getByTestId('select-project').click();
    await page.getByTestId('item-project-downtown').click();
    await page.getByTestId('input-channel-title').fill('Site coordination');
    await page.getByTestId('button-select-participants').click();
    await page.getByTestId('item-participant-trade').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('button-submit-create').click();
    await expect(page).toHaveURL(/conversation=new-project/);
  });

  test('desktop layout side-by-side and search filtering', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/__visual/messages');
    await expect(page.getByText('City Electric').first()).toBeVisible();
    await expect(page.getByPlaceholder('Transmit message...')).toBeVisible();
    
    // Check initial dark aesthetic and layout
    await expect(page).toHaveScreenshot('desktop-messages-initial.png', {
      animations: 'disabled',
      timeout: 10_000,
      maxDiffPixels: 14_000,
    });

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
    await expect(page).toHaveScreenshot('mobile-messages-list.png', {
      animations: 'disabled',
      maxDiffPixels: 500,
    });

    // Click chat to go to detail
    await page.getByRole('button', { name: 'Open channel for Downtown Office Reno' }).click();
    await expect(page.getByPlaceholder('Transmit message...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to conversations' })).toBeVisible();
    await expect(page).toHaveScreenshot('mobile-messages-detail.png', {
      animations: 'disabled',
      maxDiffPixels: 13_000,
    });

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
    await expect(page.getByRole('paragraph').filter({ hasText: testMessage })).toBeVisible();
    
    const secondMessage = 'Yes they are.';
    await input.fill(secondMessage);
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.getByRole('paragraph').filter({ hasText: secondMessage })).toBeVisible();
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
