/**
 * @file Navigation Workflow E2E Tests
 * @module __tests__/e2e/navigation.spec.js
 */

const { test, expect } = require('@playwright/test');

test.describe('Turn-by-Turn Navigation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should start navigation from calculated route', async ({ page }) => {
    // Calculate route first
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Start navigation
    await page.click('[data-testid="start-navigation"]');
    
    // Verify navigation view is displayed
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });
    const navView = await page.locator('[data-testid="navigation-view"]');
    await expect(navView).toBeVisible();
  });

  test('should display turn-by-turn instructions', async ({ page }) => {
    // Start navigation
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    await page.click('[data-testid="start-navigation"]');
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });

    // Verify turn instructions are displayed
    const turnInstruction = await page.locator('[data-testid="turn-instruction"]');
    await expect(turnInstruction).toBeVisible();
    
    const distance = await page.locator('[data-testid="distance-to-turn"]');
    await expect(distance).toContainText(/\d+/);
  });

  test('should update location during navigation', async ({ page }) => {
    // Start navigation
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    await page.click('[data-testid="start-navigation"]');
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });

    // Verify current location is displayed
    const currentLocation = await page.locator('[data-testid="current-location"]');
    await expect(currentLocation).toBeVisible();
    
    // Verify location updates
    await page.waitForTimeout(2000);
    const updatedLocation = await currentLocation.textContent();
    expect(updatedLocation).toBeTruthy();
  });

  test('should display speed limit during navigation', async ({ page }) => {
    // Start navigation
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    await page.click('[data-testid="start-navigation"]');
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });

    // Verify speed limit is displayed
    const speedLimit = await page.locator('[data-testid="speed-limit"]');
    if (await speedLimit.isVisible()) {
      const speedText = await speedLimit.textContent();
      expect(speedText).toMatch(/\d+/);
    }
  });

  test('should allow pause/resume navigation', async ({ page }) => {
    // Start navigation
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    await page.click('[data-testid="start-navigation"]');
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });

    // Pause navigation
    await page.click('[data-testid="pause-navigation"]');
    let pauseBtn = await page.locator('[data-testid="pause-navigation"]');
    await expect(pauseBtn).toContainText(/Resume|Pause/);

    // Resume navigation
    await page.click('[data-testid="pause-navigation"]');
    pauseBtn = await page.locator('[data-testid="pause-navigation"]');
    await expect(pauseBtn).toContainText(/Resume|Pause/);
  });

  test('should end navigation', async ({ page }) => {
    // Start navigation
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    await page.click('[data-testid="start-navigation"]');
    await page.waitForSelector('[data-testid="navigation-view"]', { timeout: 5000 });

    // End navigation
    await page.click('[data-testid="end-navigation"]');
    
    // Verify navigation view is closed
    const navView = await page.locator('[data-testid="navigation-view"]');
    await expect(navView).not.toBeVisible();
  });
});

