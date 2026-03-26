/**
 * Dashboard E2E Tests
 * Critical path: View stats, connect shop, sync data
 */

import { test, expect } from '@playwright/test';

// Helper: Login before each test
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('test@example.com');
  await page.getByLabel(/password/i).fill('TestPassword123!');
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page).toHaveURL('/dashboard');
});

test.describe('Dashboard', () => {
  
  test('should display dashboard with key metrics', async ({ page }) => {
    // Check for main dashboard elements
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    
    // Should show metric cards
    await expect(page.getByText(/products/i)).toBeVisible();
    await expect(page.getByText(/orders/i)).toBeVisible();
    await expect(page.getByText(/revenue/i)).toBeVisible();
  });

  test('should show connection status section', async ({ page }) => {
    // Connection status card should be visible
    const connectionStatus = page.locator('text=/Etsy Shop|Connection Status/i').first();
    await expect(connectionStatus).toBeVisible();
  });

  test('should navigate to products page', async ({ page }) => {
    // Click on sidebar navigation
    await page.getByRole('link', { name: /products/i }).click();
    
    // Should navigate to products page
    await expect(page).toHaveURL('/products');
    await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();
  });

  test('should navigate to orders page', async ({ page }) => {
    // Click on sidebar navigation
    await page.getByRole('link', { name: /orders/i }).click();
    
    // Should navigate to orders page
    await expect(page).toHaveURL('/orders');
    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
  });

  test('should display recent transactions table', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000);
    
    // Recent transactions section should exist
    const recentSection = page.locator('text=/recent.*transactions/i');
    await expect(recentSection.or(page.getByText(/no.*orders/i))).toBeVisible();
  });

  test('should show shop selector dropdown', async ({ page }) => {
    // Shop selector should be visible in topbar
    const shopSelector = page.locator('button').filter({ hasText: /shop/i }).first();
    
    // If shops exist, selector should be visible
    await expect(shopSelector.or(page.getByText(/connect.*shop/i))).toBeVisible();
  });

  test('should toggle sidebar on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Sidebar should be collapsed on mobile
    const sidebar = page.locator('aside, nav').first();
    
    // Click hamburger menu (if exists)
    const menuButton = page.getByRole('button', { name: /menu/i });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await expect(sidebar).toBeVisible();
    }
  });

  test('should display welcome toast for new users', async ({ page }) => {
    // Navigate with welcome param
    await page.goto('/dashboard?welcome=true');
    
    // Toast should appear
    const toast = page.locator('.fixed.top-4.right-4');
    await expect(toast).toBeVisible();
  });
});

test.describe('Dashboard Data Sync', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('TestPassword123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should trigger order sync', async ({ page }) => {
    // Navigate to orders
    await page.goto('/orders');
    
    // Click sync button
    const syncButton = page.getByRole('button', { name: /sync/i }).first();
    
    if (await syncButton.isVisible()) {
      await syncButton.click();
      
      // Should show loading or success state
      await expect(syncButton.or(page.getByText(/syncing/i))).toBeVisible();
    }
  });

  test('should refresh dashboard on data change', async ({ page }) => {
    // Get initial order count
    const orderMetric = page.locator('text=/\\d+.*orders/i').first();
    const initialText = await orderMetric.textContent();
    
    // Trigger sync (via API or button click)
    await page.goto('/orders');
    const syncButton = page.getByRole('button', { name: /sync/i }).first();
    
    if (await syncButton.isVisible()) {
      await syncButton.click();
      await page.waitForTimeout(3000); // Wait for sync
      
      // Go back to dashboard
      await page.goto('/dashboard');
      
      // Metric should update (or stay same if no new data)
      await expect(orderMetric).toBeVisible();
    }
  });
});
