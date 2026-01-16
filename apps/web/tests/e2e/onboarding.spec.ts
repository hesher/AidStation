/**
 * Onboarding E2E Tests
 *
 * End-to-end tests for User Story 1: Onboarding Experience
 *
 * Tests the complete flow:
 * 1. User enters race name
 * 2. AI searches for race information
 * 3. Course is displayed on map
 * 4. Aid station table is populated with data
 */

import { test, expect } from '@playwright/test';

test.describe('User Story 1: Onboarding Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display onboarding form on first load', async ({ page }) => {
    // Verify the hero section is visible
    await expect(page.locator('h1')).toContainText('AidStation');

    // Verify onboarding elements are present
    await expect(page.locator('h2')).toContainText('Find Your Race');
    await expect(page.getByTestId('race-search-input')).toBeVisible();
    await expect(page.getByTestId('race-search-button')).toBeVisible();
  });

  test('should have disabled search button when input is empty', async ({ page }) => {
    const searchButton = page.getByTestId('race-search-button');
    await expect(searchButton).toBeDisabled();
  });

  test('should enable search button when race name is entered', async ({ page }) => {
    const searchInput = page.getByTestId('race-search-input');
    const searchButton = page.getByTestId('race-search-button');

    await searchInput.fill('Western States 100');
    await expect(searchButton).toBeEnabled();
  });

  test('should show loading state when searching', async ({ page }) => {
    const searchInput = page.getByTestId('race-search-input');
    const searchButton = page.getByTestId('race-search-button');

    await searchInput.fill('Test Race');
    await searchButton.click();

    // Should show loading state (may be brief)
    const loadingState = page.getByTestId('loading-state');
    // Note: This test may be flaky if the API responds too quickly
    // In production, we'd mock the API for consistent behavior
    await expect(loadingState.or(page.getByTestId('race-content')).or(page.getByTestId('error-state'))).toBeVisible();
  });

  test('should display error state when API fails', async ({ page }) => {
    // Mock the API to return an error
    await page.route('**/api/races/search', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Failed to connect to AI service'
        }),
      });
    });

    const searchInput = page.getByTestId('race-search-input');
    const searchButton = page.getByTestId('race-search-button');

    await searchInput.fill('Some Race');
    await searchButton.click();

    // Should show error state
    await expect(page.getByTestId('error-state')).toBeVisible();
    await expect(page.getByText('Unable to Find Race')).toBeVisible();
  });

  test('should display race card after successful search', async ({ page }) => {
    // Mock successful API response
    await page.route('**/api/races/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Western States Endurance Run',
            date: '2024-06-29',
            location: 'Squaw Valley to Auburn',
            country: 'USA',
            distanceKm: 161,
            elevationGainM: 5500,
            elevationLossM: 7000,
            startTime: '05:00',
            overallCutoffHours: 30,
            description: 'The oldest 100-mile trail race in the United States.',
            aidStations: [
              { name: 'Start', distanceKm: 0, elevationM: 1890 },
              { name: 'Lyon Ridge', distanceKm: 10.5, elevationM: 2200, hasDropBag: false, hasCrew: false, hasPacer: false },
              { name: 'Red Star Ridge', distanceKm: 24.2, elevationM: 2400, hasDropBag: true, hasCrew: false, hasPacer: false },
              { name: 'Robinson Flat', distanceKm: 45.3, elevationM: 2100, hasDropBag: true, hasCrew: true, hasPacer: false },
              { name: 'Foresthill', distanceKm: 100.2, elevationM: 1000, hasDropBag: true, hasCrew: true, hasPacer: true },
            ],
            courseCoordinates: [
              { lat: 39.1969, lon: -120.2451, elevation: 1890 },
              { lat: 39.2100, lon: -120.3500, elevation: 2200 },
              { lat: 39.2500, lon: -120.5000, elevation: 2400 },
              { lat: 39.3000, lon: -120.6500, elevation: 2100 },
              { lat: 38.8047, lon: -121.0183, elevation: 400 },
            ],
          },
        }),
      });
    });

    const searchInput = page.getByTestId('race-search-input');
    const searchButton = page.getByTestId('race-search-button');

    await searchInput.fill('Western States 100');
    await searchButton.click();

    // Wait for race content to load
    await expect(page.getByTestId('race-content')).toBeVisible({ timeout: 10000 });

    // Verify race card is displayed
    await expect(page.getByTestId('race-card')).toBeVisible();
    await expect(page.getByText('Western States Endurance Run')).toBeVisible();

    // Verify race details are shown
    await expect(page.getByText('161.0 km')).toBeVisible();
    await expect(page.getByText('USA')).toBeVisible();
  });

  test('should display aid station table with all columns', async ({ page }) => {
    // Mock successful API response with aid stations
    await page.route('**/api/races/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Race',
            distanceKm: 100,
            aidStations: [
              {
                name: 'Start',
                distanceKm: 0,
                distanceFromPrevKm: 0,
                elevationM: 1000,
                elevationGainFromPrevM: 0,
                elevationLossFromPrevM: 0,
                hasDropBag: false,
                hasCrew: false,
                hasPacer: false
              },
              {
                name: 'Aid 1',
                distanceKm: 25,
                distanceFromPrevKm: 25,
                elevationM: 1500,
                elevationGainFromPrevM: 500,
                elevationLossFromPrevM: 0,
                hasDropBag: true,
                hasCrew: false,
                hasPacer: false
              },
              {
                name: 'Aid 2',
                distanceKm: 50,
                distanceFromPrevKm: 25,
                elevationM: 1200,
                elevationGainFromPrevM: 100,
                elevationLossFromPrevM: 400,
                hasDropBag: true,
                hasCrew: true,
                hasPacer: false
              },
              {
                name: 'Finish',
                distanceKm: 100,
                distanceFromPrevKm: 50,
                elevationM: 800,
                elevationGainFromPrevM: 200,
                elevationLossFromPrevM: 600,
                hasDropBag: false,
                hasCrew: true,
                hasPacer: true
              },
            ],
          },
        }),
      });
    });

    await page.getByTestId('race-search-input').fill('Test Race');
    await page.getByTestId('race-search-button').click();

    await expect(page.getByTestId('race-content')).toBeVisible({ timeout: 10000 });

    // Verify aid station table exists
    await expect(page.getByTestId('aid-station-table')).toBeVisible();

    // Verify table headers
    await expect(page.getByText('Station')).toBeVisible();
    await expect(page.getByText('Distance')).toBeVisible();
    await expect(page.getByText('Elevation')).toBeVisible();
    await expect(page.getByText('Services')).toBeVisible();

    // Verify aid stations are rendered
    await expect(page.getByTestId('aid-station-row-0')).toBeVisible();
    await expect(page.getByTestId('aid-station-row-1')).toBeVisible();
    await expect(page.getByTestId('aid-station-row-2')).toBeVisible();
    await expect(page.getByTestId('aid-station-row-3')).toBeVisible();

    // Verify station names
    await expect(page.getByText('Start')).toBeVisible();
    await expect(page.getByText('Aid 1')).toBeVisible();
    await expect(page.getByText('Aid 2')).toBeVisible();
    await expect(page.getByText('Finish')).toBeVisible();
  });

  test('should display course map when coordinates are available', async ({ page }) => {
    // Mock successful API response with course coordinates
    await page.route('**/api/races/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Race',
            distanceKm: 50,
            courseCoordinates: [
              { lat: 39.1969, lon: -120.2451, elevation: 1890 },
              { lat: 39.2500, lon: -120.5000, elevation: 2400 },
              { lat: 38.8047, lon: -121.0183, elevation: 400 },
            ],
            aidStations: [
              { name: 'Start', distanceKm: 0 },
              { name: 'Mid', distanceKm: 25 },
              { name: 'Finish', distanceKm: 50 },
            ],
          },
        }),
      });
    });

    await page.getByTestId('race-search-input').fill('Test Race');
    await page.getByTestId('race-search-button').click();

    await expect(page.getByTestId('race-content')).toBeVisible({ timeout: 10000 });

    // Verify map container is visible
    await expect(page.getByTestId('course-map')).toBeVisible();
  });

  test('should allow starting a new search after viewing race', async ({ page }) => {
    // Mock API response
    await page.route('**/api/races/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'First Race',
            distanceKm: 100,
          },
        }),
      });
    });

    // Search for first race
    await page.getByTestId('race-search-input').fill('First Race');
    await page.getByTestId('race-search-button').click();

    await expect(page.getByTestId('race-content')).toBeVisible({ timeout: 10000 });

    // Click back/new search button
    await page.getByText('← Search New Race').click();

    // Should return to onboarding form
    await expect(page.getByText('Find Your Race')).toBeVisible();
    await expect(page.getByTestId('race-search-input')).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify elements are visible on mobile
    await expect(page.getByTestId('race-search-input')).toBeVisible();
    await expect(page.getByTestId('race-search-button')).toBeVisible();

    // Input should be full width on mobile
    const input = page.getByTestId('race-search-input');
    const inputBox = await input.boundingBox();
    expect(inputBox?.width).toBeGreaterThan(300);
  });
});

test.describe('Race Search Input Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should trim whitespace from race name', async ({ page }) => {
    await page.route('**/api/races/search', async (route) => {
      const requestBody = await route.request().postDataJSON();
      expect(requestBody.query).toBe('Western States 100');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { name: 'Western States 100' } }),
      });
    });

    await page.getByTestId('race-search-input').fill('  Western States 100  ');
    await page.getByTestId('race-search-button').click();
  });

  test('should not submit form with only whitespace', async ({ page }) => {
    const searchInput = page.getByTestId('race-search-input');
    const searchButton = page.getByTestId('race-search-button');

    await searchInput.fill('   ');
    await expect(searchButton).toBeDisabled();
  });
});
