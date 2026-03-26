/**
 * Authentication Flow E2E Tests
 * Critical path: Registration, Login, Logout
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  
  test('should display landing page to unauthenticated users', async ({ page }) => {
    await page.goto('/');
    
    // Landing page should be visible
    await expect(page.getByRole('heading', { name: /Empower Your Business/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Get Started/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('should navigate to registration page', async ({ page }) => {
    await page.goto('/');
    
    // Click "Get Started" button
    await page.getByRole('button', { name: /Get Started/i }).first().click();
    
    // Should redirect to register page
    await expect(page).toHaveURL('/register');
    await expect(page.getByRole('heading', { name: /Create.*Account/i })).toBeVisible();
  });

  test('should show validation errors on empty registration', async ({ page }) => {
    await page.goto('/register');
    
    // Try to submit empty form
    await page.getByRole('button', { name: /Sign up/i }).click();
    
    // HTML5 validation should prevent submission
    const nameInput = page.getByLabel(/username/i);
    await expect(nameInput).toBeFocused();
  });

  test('should register new user successfully', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;
    
    await page.goto('/register');
    
    // Fill registration form
    await page.getByLabel(/username/i).fill(`TestUser${timestamp}`);
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill('TestPassword123!');
    
    // Accept terms
    await page.getByRole('checkbox', { name: /agree.*terms/i }).check();
    
    // Submit form
    await page.getByRole('button', { name: /Sign up/i }).click();
    
    // Should redirect to login with success message
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/account created/i)).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    // Use existing test account or create one
    await page.goto('/login');
    
    // Fill login form
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('TestPassword123!');
    
    // Check remember me (optional)
    await page.getByRole('checkbox', { name: /remember me/i }).check();
    
    // Submit form
    await page.getByRole('button', { name: /Sign in/i }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill with wrong password
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('WrongPassword123!');
    
    // Submit form
    await page.getByRole('button', { name: /Sign in/i }).click();
    
    // Should show error message (red background)
    const errorMessage = page.locator('.bg-red-50');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/invalid.*password/i);
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('TestPassword123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Click user menu and logout
    await page.getByRole('button', { name: /profile/i }).click();
    await page.getByRole('menuitem', { name: /logout/i }).click();
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should toggle password visibility', async ({ page }) => {
    await page.goto('/login');
    
    const passwordInput = page.getByLabel(/password/i);
    const toggleButton = page.locator('button[type="button"]').filter({ has: page.locator('svg') }).first();
    
    // Password should be hidden initially
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click toggle button
    await toggleButton.click();
    
    // Password should be visible
    await expect(passwordInput).toHaveAttribute('type', 'text');
    
    // Click again to hide
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should navigate between login and register', async ({ page }) => {
    await page.goto('/login');
    
    // Click "Sign up" link
    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL('/register');
    
    // Click "Sign in" link
    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/login');
  });
});
