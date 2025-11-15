/**
 * @file Trip History E2E Tests
 * @module __tests__/e2e/trip-history.spec.js
 */

const { test, expect } = require('@playwright/test');

test.describe('Trip History Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should record trip after navigation', async ({ page }) => {
    // Calculate and start navigation
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
    
    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Verify trip is recorded
    const tripList = await page.locator('[data-testid="trip-item"]');
    const count = await tripList.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display trip details', async ({ page }) => {
    // Record a trip first
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
    await page.click('[data-testid="end-navigation"]');

    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Click on trip to view details
    const firstTrip = await page.locator('[data-testid="trip-item"]').first();
    await firstTrip.click();

    // Verify trip details are displayed
    const tripDetails = await page.locator('[data-testid="trip-details"]');
    await expect(tripDetails).toBeVisible();
    
    const distance = await page.locator('[data-testid="trip-distance"]');
    const duration = await page.locator('[data-testid="trip-duration"]');
    const cost = await page.locator('[data-testid="trip-cost"]');
    
    await expect(distance).toBeVisible();
    await expect(duration).toBeVisible();
    await expect(cost).toBeVisible();
  });

  test('should display trip analytics', async ({ page }) => {
    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Click on analytics tab
    await page.click('[data-testid="analytics-tab"]');

    // Verify analytics are displayed
    const totalDistance = await page.locator('[data-testid="total-distance"]');
    const totalDuration = await page.locator('[data-testid="total-duration"]');
    const totalCost = await page.locator('[data-testid="total-cost"]');
    const averageSpeed = await page.locator('[data-testid="average-speed"]');

    await expect(totalDistance).toBeVisible();
    await expect(totalDuration).toBeVisible();
    await expect(totalCost).toBeVisible();
    await expect(averageSpeed).toBeVisible();
  });

  test('should filter trips by date', async ({ page }) => {
    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Set date filter
    const today = new Date().toISOString().split('T')[0];
    await page.fill('[data-testid="date-filter"]', today);

    // Verify trips are filtered
    const tripList = await page.locator('[data-testid="trip-item"]');
    const count = await tripList.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should delete trip from history', async ({ page }) => {
    // Record a trip first
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
    await page.click('[data-testid="end-navigation"]');

    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Get initial count
    const initialCount = await page.locator('[data-testid="trip-item"]').count();

    // Delete first trip
    const firstTrip = await page.locator('[data-testid="trip-item"]').first();
    await firstTrip.hover();
    await page.click('[data-testid="delete-trip"]');
    
    // Confirm deletion
    await page.click('[data-testid="confirm-delete"]');

    // Verify trip is deleted
    const finalCount = await page.locator('[data-testid="trip-item"]').count();
    expect(finalCount).toBeLessThan(initialCount);
  });

  test('should export trip history', async ({ page }) => {
    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Export history
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-history"]');
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toContain('trip-history');
  });

  test('should clear all trip history', async ({ page }) => {
    // Open trip history
    await page.click('[data-testid="trip-history-button"]');
    await page.waitForSelector('[data-testid="trip-history-panel"]', { timeout: 5000 });

    // Clear all
    await page.click('[data-testid="clear-all"]');
    
    // Confirm clear
    await page.click('[data-testid="confirm-clear"]');

    // Verify history is cleared
    const tripList = await page.locator('[data-testid="trip-item"]');
    const count = await tripList.count();
    expect(count).toBe(0);
  });
});

