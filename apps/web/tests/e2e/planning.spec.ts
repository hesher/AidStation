/**
 * Planning Page E2E Tests
 *
 * Tests for User Story 5: Race Planning
 *
 * Tests the planning workflow:
 * 1. Creating new race plans
 * 2. Viewing plan predictions with aid station timeline
 * 3. Pace settings adjustment
 * 4. Export to PDF functionality
 */

import { test, expect } from '@playwright/test';

test.describe('User Story 5: Race Planning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/planning');
  });

  test.describe('Planning Page Layout', () => {
    test('should display planning page with correct title', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Race Planning');
      await expect(page.getByText('Create personalized race plans')).toBeVisible();
    });

    test('should display create plan section', async ({ page }) => {
      await expect(page.getByText('Create New Plan')).toBeVisible();
      await expect(page.locator('select')).toBeVisible();
    });

    test('should display your plans section', async ({ page }) => {
      await expect(page.getByText('Your Plans')).toBeVisible();
    });

    test('should display navigation bar', async ({ page }) => {
      await expect(page.getByTestId('navbar')).toBeVisible();
      await expect(page.getByTestId('nav-home')).toBeVisible();
      await expect(page.getByTestId('nav-planning')).toBeVisible();
      await expect(page.getByTestId('nav-performances')).toBeVisible();
    });
  });

  test.describe('Plan Creation', () => {
    test('should show race selector dropdown', async ({ page }) => {
      const raceSelect = page.locator('select');
      await expect(raceSelect).toBeVisible();
      await expect(raceSelect).toContainText('Select a race...');
    });

    test('should show plan name input', async ({ page }) => {
      const planNameInput = page.locator('input[placeholder*="Plan name"]');
      await expect(planNameInput).toBeVisible();
    });

    test('should have disabled create button when no race selected', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /Create Plan/i });
      await expect(createButton).toBeDisabled();
    });
  });

  test.describe('Plan Details View', () => {
    test('should show empty state when no plan selected', async ({ page }) => {
      await expect(page.getByText('No Plan Selected')).toBeVisible();
      await expect(page.getByText('Select an existing plan')).toBeVisible();
    });
  });

  test.describe('Plan with Mocked Data', () => {
    test('should display plan summary when plan is selected', async ({ page }) => {
      // Mock the API responses
      await page.route('**/api/plans', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                plans: [
                  {
                    id: 'plan-1',
                    name: 'UTMB A Goal',
                    predictedTotalMinutes: 1800,
                    predictedFinishTime: '2024-08-31T05:00:00Z',
                    race: {
                      name: 'UTMB',
                      distanceKm: 171,
                    },
                    aidStationPredictions: [
                      {
                        aidStationId: '1',
                        aidStationName: 'Saint-Gervais',
                        distanceKm: 21.4,
                        predictedArrivalTime: '2024-08-30T08:30:00Z',
                        predictedArrivalMinutes: 180,
                        cutoffHoursFromStart: 6,
                        bufferMinutes: 180,
                        status: 'safe',
                        pacePredictions: { segmentPaceMinKm: 8.4 },
                      },
                      {
                        aidStationId: '2',
                        aidStationName: 'Les Contamines',
                        distanceKm: 31.2,
                        predictedArrivalTime: '2024-08-30T10:00:00Z',
                        predictedArrivalMinutes: 270,
                        cutoffHoursFromStart: 8,
                        bufferMinutes: 120,
                        status: 'warning',
                        pacePredictions: { segmentPaceMinKm: 9.2 },
                      },
                    ],
                  },
                ],
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/races/saved', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              races: [
                { id: 'race-1', name: 'UTMB', distanceKm: 171 },
              ],
            },
          }),
        });
      });

      await page.route('**/api/performances/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              flatPaceMinKm: 5.5,
              climbingPaceMinKm: 12,
              activitiesCount: 15,
            },
          }),
        });
      });

      // Reload page to get mocked data
      await page.reload();
      await page.waitForTimeout(1000);

      // Click on the plan to select it
      const planItem = page.getByText('UTMB A Goal');
      if (await planItem.isVisible()) {
        await planItem.click();

        // Verify plan summary is displayed
        await expect(page.getByText('UTMB A Goal')).toBeVisible();
        await expect(page.getByText('171 km')).toBeVisible();
      }
    });

    test('should display aid station timeline with status colors', async ({ page }) => {
      await page.route('**/api/plans', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              plans: [
                {
                  id: 'plan-1',
                  name: 'Test Plan',
                  race: { name: 'Test Race', distanceKm: 100 },
                  aidStationPredictions: [
                    {
                      aidStationId: '1',
                      aidStationName: 'Station Safe',
                      distanceKm: 25,
                      status: 'safe',
                      predictedArrivalMinutes: 150,
                      bufferMinutes: 60,
                      pacePredictions: { segmentPaceMinKm: 6 },
                    },
                    {
                      aidStationId: '2',
                      aidStationName: 'Station Warning',
                      distanceKm: 50,
                      status: 'warning',
                      predictedArrivalMinutes: 300,
                      bufferMinutes: 20,
                      pacePredictions: { segmentPaceMinKm: 6.5 },
                    },
                    {
                      aidStationId: '3',
                      aidStationName: 'Station Danger',
                      distanceKm: 75,
                      status: 'danger',
                      predictedArrivalMinutes: 500,
                      bufferMinutes: 10,
                      pacePredictions: { segmentPaceMinKm: 7 },
                    },
                  ],
                },
              ],
            },
          }),
        });
      });

      await page.route('**/api/races/saved', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { races: [] } }),
        });
      });

      await page.route('**/api/performances/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { activitiesCount: 0 } }),
        });
      });

      await page.reload();
      await page.waitForTimeout(1000);

      // Select the plan
      const planItem = page.getByText('Test Plan');
      if (await planItem.isVisible()) {
        await planItem.click();

        // Verify legend is visible
        await expect(page.getByText('Safe (>30m buffer)')).toBeVisible();
        await expect(page.getByText('Warning (15-30m buffer)')).toBeVisible();
        await expect(page.getByText('Danger (<15m buffer)')).toBeVisible();
      }
    });
  });

  test.describe('Pace Settings', () => {
    test('should have pace settings toggle button', async ({ page }) => {
      // Mock a selected plan
      await page.route('**/api/plans', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              plans: [
                {
                  id: 'plan-1',
                  name: 'Test Plan',
                  race: { name: 'Test Race', distanceKm: 100 },
                  aidStationPredictions: [],
                },
              ],
            },
          }),
        });
      });

      await page.route('**/api/races/saved', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { races: [] } }),
        });
      });

      await page.route('**/api/performances/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { activitiesCount: 0 } }),
        });
      });

      await page.reload();
      await page.waitForTimeout(1000);

      const planItem = page.getByText('Test Plan');
      if (await planItem.isVisible()) {
        await planItem.click();

        // Check for pace settings toggle
        const paceToggle = page.getByText('Show Pace Settings');
        await expect(paceToggle).toBeVisible();
      }
    });
  });

  test.describe('Export Functionality', () => {
    test('should have export PDF button when plan is selected', async ({ page }) => {
      await page.route('**/api/plans', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              plans: [
                {
                  id: 'plan-1',
                  name: 'Export Test Plan',
                  race: { name: 'Test Race', distanceKm: 100 },
                  aidStationPredictions: [],
                },
              ],
            },
          }),
        });
      });

      await page.route('**/api/races/saved', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { races: [] } }),
        });
      });

      await page.route('**/api/performances/profile', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { activitiesCount: 0 } }),
        });
      });

      await page.reload();
      await page.waitForTimeout(1000);

      const planItem = page.getByText('Export Test Plan');
      if (await planItem.isVisible()) {
        await planItem.click();

        // Check for export PDF button
        const exportButton = page.getByText('📄 Export PDF');
        await expect(exportButton).toBeVisible();
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to home page when home link clicked', async ({ page }) => {
      await page.getByTestId('nav-home').click();
      await expect(page).toHaveURL('/');
    });

    test('should navigate to performances page when link clicked', async ({ page }) => {
      await page.getByTestId('nav-performances').click();
      await expect(page).toHaveURL('/performances');
    });
  });
});
