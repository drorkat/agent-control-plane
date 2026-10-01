import { test, expect, type Page } from '@playwright/test';

// Runs against the real web app (which proxies /api/* to a real API + Postgres).
// Credentials default to the seeded demo owner; override via env in CI if needed.
const EMAIL = process.env.E2E_EMAIL || 'admin@acp.local';
const PASSWORD = process.env.E2E_PASSWORD || 'admin1234';

/** Sign in and land on the dashboard with the app chrome rendered. */
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => new URL(url).pathname === '/');
  // The user menu (avatar) only renders once the session resolved.
  await expect(page.locator('button[aria-haspopup="menu"]')).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  // The sandbox has no outbound font/CDN access; abort those so pages don't hang.
  await context.route(/(googleapis|gstatic|google\.com)/, (route) => route.abort());
});

test('a signed-out visitor is redirected to /login', async ({ page }) => {
  await page.goto('/projects');
  await page.waitForURL((url) => new URL(url).pathname === '/login');
  await expect(page.locator('#email')).toBeVisible();
});

test('login lands on the dashboard with app chrome', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/$/);
});

test('every key route renders for an authenticated user', async ({ page }) => {
  await login(page);
  const routes = [
    '/projects',
    '/agents',
    '/tasks',
    '/runs',
    '/approvals',
    '/audit',
    '/automation',
    '/team',
    '/settings',
  ];
  for (const path of routes) {
    await page.goto(path);
    await expect(page, `stayed on ${path}`).toHaveURL(new RegExp(`${path}$`));
    // App chrome present (not bounced to /login, not an error boundary) and the
    // page has a heading.
    await expect(page.locator('button[aria-haspopup="menu"]')).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
  }
});

test('the language toggle flips direction to RTL and back', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('a project can be created through the UI', async ({ page }) => {
  await login(page);
  await page.goto('/projects');
  const name = `E2E Project ${Date.now()}`;
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.fill('#project-name', name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(name)).toBeVisible();
});

test('logout returns to /login', async ({ page }) => {
  await login(page);
  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL((url) => new URL(url).pathname === '/login');
  await expect(page.locator('#email')).toBeVisible();
});
