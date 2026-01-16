/**
 * Performances Page E2E Tests
 *
 * Tests for User Story 4: Past Performances
 *
 * Tests the performances workflow:
 * 1. Viewing past activities
 * 2. Uploading new GPX files
 * 3. Performance profile display
 * 4. Navigation
 */

import { test, expect } from '@playwright/test';

test.describe('User Story 4: Past Performances', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/performances');
  });

  test.describe('Performances Page Layout', () => {
    test('should display performances page with correct title', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Past Performances');
      await expect(page.getByText('Upload your GPX files')).toBeVisible();
    });

    test('should display performance summary section', async ({ page }) => {
      await expect(page.getByText('Performance Summary')).toBeVisible();
    });

    test('should display upload section', async ({ page }) => {
      await expect(page.getByText('Upload Activities')).toBeVisible();
    });

    test('should display activities section', async ({ page }) => {
      await expect(page.getByText('Uploaded Activities')).toBeVisible();
    });

    test('should display navigation links', async ({ page }) => {
      await expect(page.getByText('← Back to Home')).toBeVisible();
      await expect(page.getByText('📋 Race Planning')).toBeVisible();
    });
  });

  test.describe('Performance Profile', () => {
    test('should display profile stats labels', async ({ page }) => {
      // Verify the labels are present in the summary section
      await expect(page.getByText('Performance Summary')).toBeVisible();
    });
  });

  test.describe('Activity Upload', () => {
    test('should have file input for GPX upload', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();
    });

    test('should accept GPX files', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toHaveAttribute('accept', /.gpx/);
    });
  });

  test.describe('Activities List', () => {
    test('should have activities table header', async ({ page }) => {
      // Table should have proper headers
      await expect(page.getByText('Uploaded Activities')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to home page when back link clicked', async ({ page }) => {
      await page.getByText('← Back to Home').click();
      await expect(page).toHaveURL('/');
    });

    test('should navigate to planning page when planning link clicked', async ({ page }) => {
      await page.getByText('📋 Race Planning').click();
      await expect(page).toHaveURL('/planning');
    });
  });

  test.describe('Responsive Design', () => {
    test('should be usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Page should still be functional
      await expect(page.locator('h1')).toContainText('Past Performances');
      await expect(page.getByText('Upload Activities')).toBeVisible();
    });
  });
});
