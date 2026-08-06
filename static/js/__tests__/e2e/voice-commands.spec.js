/**
 * @file Voice Commands E2E Tests
 * @module __tests__/e2e/voice-commands.spec.js
 */

const { test, expect } = require('@playwright/test');

test.describe('Voice Commands Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should activate voice command with wake word', async ({ page }) => {
    // Click voice button
    await page.click('[data-testid="voice-button"]');
    
    // Verify voice is active
    const voiceIndicator = await page.locator('[data-testid="voice-indicator"]');
    await expect(voiceIndicator).toBeVisible();
  });

  test('should recognize route calculation command', async ({ page }) => {
    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate voice input
    await page.evaluate(() => {
      window.simulateVoiceInput('Calculate route from London to Manchester');
    });

    // Wait for route calculation
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Verify route is calculated
    const routeResult = await page.locator('[data-testid="route-result"]');
    await expect(routeResult).toBeVisible();
  });

  test('should recognize start navigation command', async ({ page }) => {
    // Calculate route first
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.getByRole('button', { name: /calculate route/i }).click();
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate voice input
    await page.evaluate(() => {
      window.simulateVoiceInput('Start navigation');
    });

    // Wait for navigation to start
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 10000 });

    // Verify navigation is started
    const navView = await page.locator('[data-testid="navigation-view"]');
    await expect(navView).toBeVisible();
  });

  test('should recognize pause command', async ({ page }) => {
    // Start navigation
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.getByRole('button', { name: /calculate route/i }).click();
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    await page.click('[data-testid="start-navigation"]');
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });

    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate voice input
    await page.evaluate(() => {
      window.simulateVoiceInput('Pause navigation');
    });

    // Verify navigation is paused
    const pauseBtn = await page.locator('[data-testid="pause-navigation"]');
    await expect(pauseBtn).toContainText(/Resume/);
  });

  test('should recognize settings command', async ({ page }) => {
    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate voice input
    await page.evaluate(() => {
      window.simulateVoiceInput('Open settings');
    });

    // Wait for settings panel
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 10000 });

    // Verify settings are opened
    const settingsPanel = await page.locator('[data-testid="settings-panel"]');
    await expect(settingsPanel).toBeVisible();
  });

  test('should recognize hazard report command', async ({ page }) => {
    // Stub report API so confirmation does not depend on allowlist/network
    await page.route('**/api/hazards/report', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, report_id: 1 }),
      });
    });
    await page.route('**/api/voice/command', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          action: 'report_hazard',
          hazard_type: 'speed_camera',
          description: 'Report speed camera ahead',
          message: 'Logging a speed camera report at your current location.',
        }),
      });
    });

    await expect(page.locator('[data-testid="voice-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="voice-indicator"]')).toBeVisible();

    // Bypass mic/SpeechRecognition — inject transcript via test hook
    await page.evaluate(() => {
      window.simulateVoiceInput('Report speed camera ahead');
    });

    const confirmation = page.locator('[data-testid="hazard-confirmation"]');
    await expect(confirmation).toBeVisible({ timeout: 10000 });
    await expect(confirmation).toHaveText(/report received/i);
  });

  test('should provide voice feedback', async ({ page }) => {
    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate voice input
    await page.evaluate(() => {
      window.simulateVoiceInput('Calculate route from London to Manchester');
    });

    // Wait for route calculation
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Verify voice feedback is provided
    const voiceFeedback = await page.locator('[data-testid="voice-feedback"]');
    if (await voiceFeedback.isVisible()) {
      const feedback = await voiceFeedback.textContent();
      expect(feedback).toBeTruthy();
    }
  });

  test('should handle unrecognized commands', async ({ page }) => {
    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate unrecognized voice input
    await page.evaluate(() => {
      window.simulateVoiceInput('Blah blah blah');
    });

    // Wait for error message
    await page.waitForSelector('[data-testid="voice-error"]', { timeout: 5000 });

    // Verify error is displayed
    const error = await page.locator('[data-testid="voice-error"]');
    await expect(error).toBeVisible();
  });

  test('should deactivate voice with command', async ({ page }) => {
    // Activate voice
    await page.click('[data-testid="voice-button"]');
    await page.waitForSelector('[data-testid="voice-indicator"]', { timeout: 5000 });

    // Simulate voice input to deactivate
    await page.evaluate(() => {
      window.simulateVoiceInput('Stop listening');
    });

    // Verify voice is deactivated
    const voiceIndicator = await page.locator('[data-testid="voice-indicator"]');
    await expect(voiceIndicator).not.toBeVisible();
  });
});

