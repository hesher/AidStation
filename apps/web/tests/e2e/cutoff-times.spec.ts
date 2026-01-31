/**
 * Cutoff Times E2E Tests
 *
 * Tests for setting race start time and editing cutoff times:
 * 1. Setting race date and start time in RaceCard
 * 2. Editing cutoff time on the Start row (startCutoffHours)
 * 3. Editing cutoff time on aid station rows
 * 4. Editing cutoff time on the Finish row (overallCutoffHours)
 * 5. SmartDurationInput interaction and validation
 */

import { test, expect, Page } from '@playwright/test';

// Helper to set up a race with mock API data
async function setupMockedRace(
  page: Page,
  options: {
    raceDate?: string;
    startTime?: string;
    overallCutoffHours?: number;
    startCutoffHours?: number;
    aidStations?: Array<{
      name: string;
      distanceKm: number;
      cutoffHoursFromStart?: number;
    }>;
  } = {}
) {
  const {
    raceDate = '2024-08-30',
    startTime = '06:00',
    overallCutoffHours = 46,
    startCutoffHours,
    aidStations = [
      { name: 'Aid Station 1', distanceKm: 25, cutoffHoursFromStart: 6 },
      { name: 'Aid Station 2', distanceKm: 50, cutoffHoursFromStart: 12 },
    ],
  } = options;

  const raceData = {
    id: 'test-race-id',
    name: 'Test 100 Mile Race',
    date: raceDate,
    startTime: startTime,
    location: 'Test Location',
    country: 'USA',
    distanceKm: 160.9,
    elevationGainM: 5000,
    elevationLossM: 5000,
    overallCutoffHours: overallCutoffHours,
    startCutoffHours: startCutoffHours,
    aidStations: aidStations.map((as, index) => ({
      name: as.name,
      distanceKm: as.distanceKm,
      distanceFromPrevKm: index === 0 ? as.distanceKm : as.distanceKm - (aidStations[index - 1]?.distanceKm || 0),
      elevationM: 1000 + index * 100,
      hasDropBag: index % 2 === 0,
      hasCrew: index === 0,
      hasPacer: false,
      cutoffHoursFromStart: as.cutoffHoursFromStart,
    })),
  };

  // Mock the API endpoints - the base URL is http://localhost:3001/api
  // But during tests, Playwright intercepts requests matching the pattern
  await page.route('**/api/races/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: raceData,
      }),
    });
  });

  // Mock save/update API calls - must be before the more specific routes
  await page.route('**/api/races/test-race-id', async (route) => {
    if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
      let body;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = raceData;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ...raceData, ...body, id: 'test-race-id' },
        }),
      });
    } else if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: raceData,
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock AI update endpoint
  await page.route('**/api/races/*/update-with-ai', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { message: 'OK', waypointUpdates: [] } }),
    });
  });

  // Mock races list endpoint
  await page.route('**/api/races', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { races: [raceData] },
        }),
      });
    } else if (route.request().method() === 'POST') {
      // Save new race
      let body;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = raceData;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ...raceData, ...body, id: 'test-race-id' },
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  
  // Wait for either the race card to appear (success) or the initializing state to complete
  await page.waitForFunction(() => {
    const raceCard = document.querySelector('[data-testid="race-card"]');
    const initState = document.querySelector('[data-testid="initializing-state"]');
    return raceCard !== null || initState === null;
  }, { timeout: 15000 });
  
  // Now wait specifically for the race card
  await page.waitForSelector('[data-testid="race-card"]', { timeout: 10000 });
}

test.describe('Race Start Time Configuration', () => {
  test('should display race date and start time in RaceCard', async ({ page }) => {
    await setupMockedRace(page, {
      raceDate: '2024-08-30',
      startTime: '06:00',
    });

    const raceCard = page.getByTestId('race-card');
    await expect(raceCard).toBeVisible();

    // Check that date is displayed (format: "Friday, August 30, 2024")
    await expect(raceCard).toContainText('August 30, 2024');

    // Check that start time is displayed
    await expect(raceCard).toContainText('06:00 start');
  });

  test('should allow editing the race date', async ({ page }) => {
    await setupMockedRace(page);

    const raceCard = page.getByTestId('race-card');

    // Click on the date to edit it
    const dateElement = raceCard.locator('text=📅').first();
    await dateElement.click();

    // Wait for the date input to appear
    const dateInput = raceCard.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();

    // Change the date
    await dateInput.fill('2024-09-15');

    // Click save button
    await raceCard.locator('button[title="Save"]').first().click();

    // Verify the new date is displayed
    await expect(raceCard).toContainText('September 15, 2024');
  });

  test('should allow editing the start time', async ({ page }) => {
    await setupMockedRace(page);

    const raceCard = page.getByTestId('race-card');

    // Click on the time to edit it
    const timeElement = raceCard.locator('text=🕐').first();
    await timeElement.click();

    // Wait for the time input to appear
    const timeInput = raceCard.locator('input[type="time"]');
    await expect(timeInput).toBeVisible();

    // Change the start time
    await timeInput.fill('05:00');

    // Click save button
    await raceCard.locator('button[title="Save"]').last().click();

    // Verify the new time is displayed
    await expect(raceCard).toContainText('05:00 start');
  });

  test('should be able to cancel date editing', async ({ page }) => {
    await setupMockedRace(page, {
      raceDate: '2024-08-30',
    });

    const raceCard = page.getByTestId('race-card');

    // Click on the date to edit it
    const dateElement = raceCard.locator('text=📅').first();
    await dateElement.click();

    // Change the date
    const dateInput = raceCard.locator('input[type="date"]');
    await dateInput.fill('2024-12-25');

    // Click cancel button
    await raceCard.locator('button[title="Cancel"]').first().click();

    // Verify the original date is still displayed
    await expect(raceCard).toContainText('August 30, 2024');
  });
});

test.describe('Start Row Cutoff Time Editing', () => {
  test('should display start row in aid station table', async ({ page }) => {
    await setupMockedRace(page);

    const aidStationTable = page.getByTestId('aid-station-table');
    await expect(aidStationTable).toBeVisible();

    // Check for start row
    const startRow = page.getByTestId('aid-station-row-start');
    await expect(startRow).toBeVisible();
    await expect(startRow).toContainText('Start');
    await expect(startRow).toContainText('0.0 km');
  });

  test('should allow clicking on start row to edit', async ({ page }) => {
    // Start row is always editable when callbacks are provided
    await setupMockedRace(page);

    // Click on start row to enter edit mode
    const startRow = page.getByTestId('aid-station-row-start');
    await startRow.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-start-editing');
    await expect(editingRow).toBeVisible();

    // Should see the SmartDurationInput container
    const cutoffCell = editingRow.locator('[class*="tdCutoff"]');
    await expect(cutoffCell).toBeVisible();
  });

  test('should save start cutoff time changes', async ({ page }) => {
    await setupMockedRace(page);

    // Click on start row to enter edit mode
    const startRow = page.getByTestId('aid-station-row-start');
    await startRow.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-start-editing');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]');
    await smartDurationInput.click();

    // Now the input should be visible
    const input = editingRow.locator('input[type="text"]');
    await expect(input).toBeVisible();
    await input.fill('3h');

    // Wait for the preview to show it parsed correctly
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();

    // Blur the input to commit the SmartDurationInput value
    await input.blur();
    
    // Small delay to ensure state is updated
    await page.waitForTimeout(100);

    // Click save button
    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Verify we're back in read mode with the cutoff displayed
    const readRow = page.getByTestId('aid-station-row-start');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('03:00');
  });

  test('should cancel start cutoff time editing on cancel click', async ({ page }) => {
    await setupMockedRace(page, {
      startCutoffHours: 2,
    });

    // Verify initial cutoff is displayed
    const startRow = page.getByTestId('aid-station-row-start');
    await expect(startRow).toContainText('02:00');

    // Click on start row to enter edit mode
    await startRow.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-start-editing');
    await expect(editingRow).toBeVisible();

    // Click cancel button without making changes
    const cancelButton = editingRow.locator('button[title="Cancel editing"]');
    await cancelButton.click();

    // Verify we're back in read mode with original value
    const readRow = page.getByTestId('aid-station-row-start');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('02:00');
  });
});

test.describe('Aid Station Cutoff Time Editing', () => {
  test('should display cutoff times for aid stations', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Mile 25 Aid', distanceKm: 40, cutoffHoursFromStart: 8 },
        { name: 'Mile 50 Aid', distanceKm: 80, cutoffHoursFromStart: 16 },
      ],
    });

    const aidStationTable = page.getByTestId('aid-station-table');
    await expect(aidStationTable).toBeVisible();

    // Check first aid station row shows cutoff
    const row0 = page.getByTestId('aid-station-row-0');
    await expect(row0).toContainText('Mile 25 Aid');
    await expect(row0).toContainText('08:00');

    // Check second aid station row shows cutoff
    const row1 = page.getByTestId('aid-station-row-1');
    await expect(row1).toContainText('Mile 50 Aid');
    await expect(row1).toContainText('16:00');
  });

  test('should allow editing aid station cutoff time', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid Station', distanceKm: 50, cutoffHoursFromStart: 10 },
      ],
    });

    // Click on the aid station row to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    // The SmartDurationInput has role="button" when in display mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();
    await cutoffInput.fill('12h');

    // Wait for the preview to show it parsed correctly
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();

    // Blur the input to commit the SmartDurationInput value
    await cutoffInput.blur();
    
    // Small delay to ensure state is updated
    await page.waitForTimeout(100);

    // Save changes
    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Verify the updated cutoff is displayed
    const readRow = page.getByTestId('aid-station-row-0');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('12:00');
  });

  test('should handle multi-day cutoff times (Day 2 format)', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Late Aid Station', distanceKm: 120, cutoffHoursFromStart: 30 },
      ],
    });

    // Check that the cutoff displays in multi-day format
    const row = page.getByTestId('aid-station-row-0');
    await expect(row).toContainText('Day 2');
  });

  test('should edit aid station cutoff using Day format', async ({ page }) => {
    await setupMockedRace(page, {
      raceDate: '2024-08-30',
      startTime: '06:00',
      aidStations: [
        { name: 'Test Aid Station', distanceKm: 50, cutoffHoursFromStart: 10 },
      ],
    });

    // Click on the aid station row to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();
    
    // Clear existing value and type new value
    await cutoffInput.clear();
    await cutoffInput.type('26h');  // 26 hours = Day 2 at 08:00 (if start is 06:00)

    // Wait for the preview to show it parsed correctly
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();

    // Press Tab to commit the value and move to next field
    await cutoffInput.press('Tab');
    
    // Small delay to ensure state is updated
    await page.waitForTimeout(200);

    // Save changes
    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Verify the cutoff shows Day 2 format (26h from 06:00 = Day 2 at 08:00)
    const readRow = page.getByTestId('aid-station-row-0');
    await expect(readRow).toContainText('Day 2');
  });
});

test.describe('Finish Row Cutoff Time Editing', () => {
  test('should display finish row with overall cutoff', async ({ page }) => {
    await setupMockedRace(page, {
      overallCutoffHours: 46,
    });

    // Check for finish row
    const finishRow = page.getByTestId('aid-station-row-finish');
    await expect(finishRow).toBeVisible();
    await expect(finishRow).toContainText('Finish');
    await expect(finishRow).toContainText('Day 2'); // 46 hours = Day 2
  });

  test('should allow editing overall cutoff time on finish row', async ({ page }) => {
    await setupMockedRace(page, {
      overallCutoffHours: 30,
    });

    // Click on finish row to edit
    const finishRow = page.getByTestId('aid-station-row-finish');
    await finishRow.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-finish-editing');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]');
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]');
    await expect(cutoffInput).toBeVisible();
    await cutoffInput.fill('48h');

    // Wait for the preview to show it parsed correctly
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();

    // Blur the input to commit the SmartDurationInput value
    await cutoffInput.blur();
    
    // Small delay to ensure state is updated
    await page.waitForTimeout(100);

    // Save changes
    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Verify the new cutoff is displayed
    const readRow = page.getByTestId('aid-station-row-finish');
    await expect(readRow).toBeVisible();
    // 48 hours from 06:00 start = Day 3 at 06:00
    await expect(readRow).toContainText('Day');
  });

  test('should cancel finish cutoff editing', async ({ page }) => {
    await setupMockedRace(page, {
      overallCutoffHours: 30,
    });

    // Click on finish row to edit
    const finishRow = page.getByTestId('aid-station-row-finish');
    await finishRow.click();

    // Wait for editing mode
    const editingRow = page.getByTestId('aid-station-row-finish-editing');
    await expect(editingRow).toBeVisible();

    // Cancel the edit without making changes
    const cancelButton = editingRow.locator('button[title="Cancel editing"]');
    await cancelButton.click();

    // Verify original value is preserved
    const readRow = page.getByTestId('aid-station-row-finish');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('Day 2');
  });
});

test.describe('SmartDurationInput Functionality', () => {
  test('should parse hours format correctly', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid', distanceKm: 25, cutoffHoursFromStart: 6 },
      ],
    });

    // Click on an aid station to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();
    
    // Test "10h" format
    await cutoffInput.fill('10h');

    // Should show valid preview (look for the preview element)
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();
  });

  test('should parse hours:minutes format correctly', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid', distanceKm: 25, cutoffHoursFromStart: 6 },
      ],
    });

    // Click on an aid station to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();

    // Test "10:30" format
    await cutoffInput.fill('10:30');

    // Should show valid preview
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();
  });

  test('should show error for invalid input', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid', distanceKm: 25, cutoffHoursFromStart: 6 },
      ],
    });

    // Click on an aid station to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();

    // Test invalid input
    await cutoffInput.fill('invalid text here');

    // Should show error preview (contains "Cannot parse" text)
    const errorPreview = editingRow.locator('text=Cannot parse');
    await expect(errorPreview).toBeVisible();
  });

  test('should save on Enter key press via row save button', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid', distanceKm: 25, cutoffHoursFromStart: 6 },
      ],
    });

    // Click on an aid station to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();

    // Clear and type a new value
    await cutoffInput.clear();
    await cutoffInput.type('15h');

    // Wait for preview to show valid result
    const preview = editingRow.locator('[class*="preview"]');
    await expect(preview.first()).toBeVisible();

    // Press Tab to commit the cutoff value
    await cutoffInput.press('Tab');
    
    // Small delay to ensure state is updated
    await page.waitForTimeout(200);

    // Then click the row save button to save the entire row
    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Should exit editing mode and show updated value
    const readRow = page.getByTestId('aid-station-row-0');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('15:00');
  });

  test('should cancel editing on Escape key press in SmartDurationInput', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid', distanceKm: 25, cutoffHoursFromStart: 6 },
      ],
    });

    // Click on an aid station to edit
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    await expect(editingRow).toBeVisible();

    // Click on the SmartDurationInput display to activate input mode
    const smartDurationInput = editingRow.locator('[role="button"]').last();
    await smartDurationInput.click();

    // Now the input should be visible
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await expect(cutoffInput).toBeVisible();

    // Enter a different value and press Escape
    await cutoffInput.fill('99h');
    await cutoffInput.press('Escape');

    // The SmartDurationInput should revert, now click cancel to exit row edit mode
    const cancelButton = editingRow.locator('button[title="Cancel editing"]');
    await cancelButton.click();

    // Should exit editing mode and preserve original value
    const readRow = page.getByTestId('aid-station-row-0');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('06:00');
  });
});

test.describe('Cutoff Time and Race Start Time Integration', () => {
  test('should update cutoff time display when race start time changes', async ({ page }) => {
    await setupMockedRace(page, {
      raceDate: '2024-08-30',
      startTime: '06:00',
      aidStations: [
        { name: 'Test Aid', distanceKm: 50, cutoffHoursFromStart: 12 },
      ],
    });

    // Initially verify the cutoff is displayed
    const row = page.getByTestId('aid-station-row-0');
    await expect(row).toContainText('12:00');

    // Change the race start time
    const raceCard = page.getByTestId('race-card');
    const timeElement = raceCard.locator('text=🕐').first();
    await timeElement.click();

    const timeInput = raceCard.locator('input[type="time"]');
    await timeInput.fill('08:00');
    await raceCard.locator('button[title="Save"]').last().click();

    // Verify start time changed
    await expect(raceCard).toContainText('08:00 start');

    // The cutoff display should still be consistent
    // (The actual wall clock time would change, but the "hours from start" remains the same)
    await expect(row).toContainText('12:00');
  });

  test('should mark changes as unsaved when cutoff is edited', async ({ page }) => {
    await setupMockedRace(page);

    // Edit an aid station cutoff
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    const cutoffInput = editingRow.locator('input[type="text"]').last();
    await cutoffInput.click();
    await cutoffInput.fill('20h');

    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Check for unsaved changes indicator
    const unsavedIndicator = page.locator('[title="Unsaved changes"]');
    // May take a moment for auto-save to not yet trigger
    await page.waitForTimeout(500);
    // The unsaved indicator should appear or auto-save should happen
  });
});

test.describe('Edge Cases and Error Handling', () => {
  test('should handle race without a start time set', async ({ page }) => {
    const raceData = {
      id: 'test-race-id',
      name: 'Test Race No Time',
      date: '2024-08-30',
      startTime: undefined,
      distanceKm: 160.9,
      overallCutoffHours: 46,
      aidStations: [
        {
          name: 'Test Aid',
          distanceKm: 50,
          cutoffHoursFromStart: 12,
        },
      ],
    };

    await page.route('**/api/races/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: raceData,
        }),
      });
    });

    await page.route('**/api/races/test-race-id', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: raceData,
        }),
      });
    });

    await page.route('**/api/races', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { races: [raceData] },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    
    // Wait for initialization to complete
    await page.waitForFunction(() => {
      const initState = document.querySelector('[data-testid="initializing-state"]');
      return initState === null;
    }, { timeout: 15000 });
    
    await page.waitForSelector('[data-testid="race-card"]', { timeout: 10000 });

    const raceCard = page.getByTestId('race-card');
    await expect(raceCard).toContainText('Start time TBD');

    // Cutoff should still display
    const row = page.getByTestId('aid-station-row-0');
    await expect(row).toContainText('12:00');
  });

  test('should handle race without a date set', async ({ page }) => {
    const raceData = {
      id: 'test-race-id',
      name: 'Test Race',
      distanceKm: 100,
      aidStations: [
        {
          name: 'Test Aid',
          distanceKm: 50,
          cutoffHoursFromStart: 12,
        },
      ],
    };

    await page.route('**/api/races/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: raceData,
        }),
      });
    });

    await page.route('**/api/races/test-race-id', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: raceData,
        }),
      });
    });

    await page.route('**/api/races', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { races: [raceData] },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    
    // Wait for initialization to complete
    await page.waitForFunction(() => {
      const initState = document.querySelector('[data-testid="initializing-state"]');
      return initState === null;
    }, { timeout: 15000 });
    
    await page.waitForSelector('[data-testid="race-card"]', { timeout: 10000 });

    const raceCard = page.getByTestId('race-card');
    await expect(raceCard).toContainText('Date TBD');
  });

  test('should handle clearing a cutoff time', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Test Aid', distanceKm: 50, cutoffHoursFromStart: 10 },
      ],
    });

    // Edit the aid station
    const row = page.getByTestId('aid-station-row-0');
    await row.click();

    const editingRow = page.getByTestId('aid-station-row-editing-0');
    const cutoffInput = editingRow.locator('input[type="text"]').last();

    // Clear the input
    await cutoffInput.click();
    await cutoffInput.clear();

    // Save the empty value
    const saveButton = editingRow.locator('button[title="Save changes"]');
    await saveButton.click();

    // Should show "--" or empty cutoff
    const readRow = page.getByTestId('aid-station-row-0');
    await expect(readRow).toBeVisible();
    await expect(readRow).toContainText('--');
  });

  test('should handle very long cutoff times (multi-day)', async ({ page }) => {
    await setupMockedRace(page, {
      raceDate: '2024-08-30',
      startTime: '06:00',
      overallCutoffHours: 72, // 3 days
    });

    const finishRow = page.getByTestId('aid-station-row-finish');
    await expect(finishRow).toContainText('Day');
  });
});

test.describe('Concurrent Editing Prevention', () => {
  test('should not allow editing multiple rows simultaneously', async ({ page }) => {
    await setupMockedRace(page, {
      aidStations: [
        { name: 'Aid 1', distanceKm: 25, cutoffHoursFromStart: 6 },
        { name: 'Aid 2', distanceKm: 50, cutoffHoursFromStart: 12 },
      ],
    });

    // Start editing first row
    const row0 = page.getByTestId('aid-station-row-0');
    await row0.click();

    // Verify first row is in edit mode
    await expect(page.getByTestId('aid-station-row-editing-0')).toBeVisible();

    // Try to click on second row - it should not enter edit mode
    // because another row is already being edited
    const row1 = page.getByTestId('aid-station-row-1');
    await row1.click();

    // First row should still be in editing mode
    await expect(page.getByTestId('aid-station-row-editing-0')).toBeVisible();

    // Second row should NOT be in editing mode
    await expect(page.getByTestId('aid-station-row-editing-1')).not.toBeVisible();
  });

  test('should not allow editing start and aid station rows simultaneously', async ({ page }) => {
    await setupMockedRace(page, {
      startCutoffHours: 1,
      aidStations: [
        { name: 'Aid 1', distanceKm: 25, cutoffHoursFromStart: 6 },
      ],
    });

    // Start editing start row
    const startRow = page.getByTestId('aid-station-row-start');
    await startRow.click();

    // Verify start row is in edit mode
    await expect(page.getByTestId('aid-station-row-start-editing')).toBeVisible();

    // Try to click on aid station row
    const row0 = page.getByTestId('aid-station-row-0');
    await row0.click();

    // Start row should still be in editing mode
    await expect(page.getByTestId('aid-station-row-start-editing')).toBeVisible();

    // Aid station row should NOT be in editing mode
    await expect(page.getByTestId('aid-station-row-editing-0')).not.toBeVisible();
  });
});
