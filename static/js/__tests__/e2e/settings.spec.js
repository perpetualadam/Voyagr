/**
 * @file Settings Management E2E Tests
 * @module __tests__/e2e/settings.spec.js
 */

const { test, expect } = require('@playwright/test');

test.describe('Settings Management Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should open settings panel', async ({ page }) => {
    // Click settings button
    await page.click('[data-testid="settings-button"]');
    
    // Verify settings panel is displayed
    const settingsPanel = await page.locator('[data-testid="settings-panel"]');
    await expect(settingsPanel).toBeVisible();
  });

  test('should change unit preferences', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Change distance unit
    await page.selectOption('[data-testid="distance-unit"]', 'miles');
    
    // Verify change is applied
    const distanceUnit = await page.locator('[data-testid="distance-unit"]');
    const value = await distanceUnit.inputValue();
    expect(value).toBe('miles');

    // Close settings
    await page.click('[data-testid="close-settings"]');
    
    // Verify settings are persisted
    await page.reload();
    await page.click('[data-testid="settings-button"]');
    const updatedUnit = await page.locator('[data-testid="distance-unit"]');
    const updatedValue = await updatedUnit.inputValue();
    expect(updatedValue).toBe('miles');
  });

  test('should change vehicle type', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Change vehicle type
    await page.selectOption('[data-testid="vehicle-type"]', 'electric');
    
    // Verify change is applied
    const vehicleType = await page.locator('[data-testid="vehicle-type"]');
    const value = await vehicleType.inputValue();
    expect(value).toBe('electric');

    // Close settings
    await page.click('[data-testid="close-settings"]');
    
    // Verify settings are persisted
    await page.reload();
    await page.click('[data-testid="settings-button"]');
    const updatedType = await page.locator('[data-testid="vehicle-type"]');
    const updatedValue = await updatedType.inputValue();
    expect(updatedValue).toBe('electric');
  });

  test('should toggle dark mode', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Toggle dark mode
    await page.check('[data-testid="dark-mode-toggle"]');
    
    // Verify dark mode is applied
    const body = await page.locator('body');
    const classes = await body.getAttribute('class');
    expect(classes).toContain('dark');

    // Close settings
    await page.click('[data-testid="close-settings"]');
    
    // Verify settings are persisted
    await page.reload();
    const updatedBody = await page.locator('body');
    const updatedClasses = await updatedBody.getAttribute('class');
    expect(updatedClasses).toContain('dark');
  });

  test('should configure route preferences', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Configure preferences
    await page.check('[data-testid="avoid-tolls"]');
    await page.check('[data-testid="avoid-highways"]');
    await page.check('[data-testid="prefer-scenic"]');
    
    // Verify preferences are set
    const avoidTolls = await page.locator('[data-testid="avoid-tolls"]');
    const avoidHighways = await page.locator('[data-testid="avoid-highways"]');
    const preferScenic = await page.locator('[data-testid="prefer-scenic"]');
    
    await expect(avoidTolls).toBeChecked();
    await expect(avoidHighways).toBeChecked();
    await expect(preferScenic).toBeChecked();

    // Close settings
    await page.click('[data-testid="close-settings"]');
    
    // Verify preferences are persisted
    await page.reload();
    await page.click('[data-testid="settings-button"]');
    const updatedAvoidTolls = await page.locator('[data-testid="avoid-tolls"]');
    await expect(updatedAvoidTolls).toBeChecked();
  });

  test('should reset settings to defaults', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Change some settings
    await page.selectOption('[data-testid="distance-unit"]', 'miles');
    await page.check('[data-testid="dark-mode-toggle"]');

    // Reset to defaults
    await page.click('[data-testid="reset-settings"]');
    
    // Confirm reset
    await page.click('[data-testid="confirm-reset"]');
    
    // Verify settings are reset
    const distanceUnit = await page.locator('[data-testid="distance-unit"]');
    const value = await distanceUnit.inputValue();
    expect(value).toBe('km');
  });

  test('should export settings', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Export settings
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-settings"]');
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toContain('settings');
  });

  test('should import settings', async ({ page }) => {
    // Create a test settings file
    const settingsData = {
      distanceUnit: 'miles',
      vehicleType: 'electric',
      darkMode: true
    };

    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="settings-panel"]', { timeout: 5000 });

    // Import settings
    await page.locator('[data-testid="import-settings"]').setInputFiles({
      name: 'settings.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(settingsData))
    });

    // Verify settings are imported
    const distanceUnit = await page.locator('[data-testid="distance-unit"]');
    const value = await distanceUnit.inputValue();
    expect(value).toBe('miles');
  });
});

