/**
 * @file Route Calculation E2E Tests
 * @module __tests__/e2e/route-calculation.spec.js
 */

const { test, expect } = require('@playwright/test');

test.describe('Route Calculation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should calculate route from start to destination', async ({ page }) => {
    // Set start location
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(500);
    
    // Select first suggestion
    const suggestions = await page.locator('[role="option"]').first();
    if (await suggestions.isVisible()) {
      await suggestions.click();
    }

    // Set destination
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(500);
    
    // Select first suggestion
    const destSuggestions = await page.locator('[role="option"]').first();
    if (await destSuggestions.isVisible()) {
      await destSuggestions.click();
    }

    // Click calculate route button
    await page.click('button:has-text("Calculate Route")');
    
    // Wait for route to be calculated
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });
    
    // Verify route is displayed
    const routeResult = await page.locator('[data-testid="route-result"]');
    await expect(routeResult).toBeVisible();
    
    // Verify route details
    const distance = await page.locator('[data-testid="route-distance"]');
    const duration = await page.locator('[data-testid="route-duration"]');
    
    await expect(distance).toContainText(/\d+/);
    await expect(duration).toContainText(/\d+/);
  });

  test('should display multiple route options', async ({ page }) => {
    // Set locations
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    // Calculate route
    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-options"]', { timeout: 10000 });

    // Verify multiple routes are shown
    const routeOptions = await page.locator('[data-testid="route-option"]');
    const count = await routeOptions.count();
    
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should calculate cost breakdown', async ({ page }) => {
    // Set locations and calculate route
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Click on cost breakdown
    await page.click('[data-testid="cost-breakdown"]');
    
    // Verify cost details
    const fuelCost = await page.locator('[data-testid="fuel-cost"]');
    const tollCost = await page.locator('[data-testid="toll-cost"]');
    
    await expect(fuelCost).toBeVisible();
    await expect(tollCost).toBeVisible();
  });

  test('should handle invalid locations', async ({ page }) => {
    // Set invalid start location
    await page.fill('input[placeholder*="Start"]', 'InvalidLocationXYZ123');
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    
    // Try to calculate route
    await page.click('button:has-text("Calculate Route")');
    
    // Wait for error message
    await page.waitForSelector('[data-testid="error-message"]', { timeout: 5000 });
    
    const errorMsg = await page.locator('[data-testid="error-message"]');
    await expect(errorMsg).toBeVisible();
  });

  test('should apply route preferences', async ({ page }) => {
    // Set locations
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    // Apply preferences
    await page.check('input[name="avoid-tolls"]');
    await page.check('input[name="avoid-highways"]');

    // Calculate route
    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Verify route is calculated with preferences
    const routeResult = await page.locator('[data-testid="route-result"]');
    await expect(routeResult).toBeVisible();
  });

  test('should save route for later', async ({ page }) => {
    // Calculate route
    await page.fill('input[placeholder*="Start"]', 'London');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    
    await page.fill('input[placeholder*="Destination"]', 'Manchester');
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();

    await page.click('button:has-text("Calculate Route")');
    await page.waitForSelector('[data-testid="route-result"]', { timeout: 10000 });

    // Save route
    await page.click('[data-testid="save-route"]');
    
    // Verify save confirmation
    const confirmation = await page.locator('[data-testid="save-confirmation"]');
    await expect(confirmation).toBeVisible();
  });
});

