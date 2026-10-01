import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The web app and API must already be running (see the CI job and the local
// run steps in the README). baseURL points at the web; the web proxies /api/*.
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// Prefer the sandbox's pre-installed Chromium (no download); in CI, where that
// path is absent, fall back to Playwright's own managed browser (installed via
// `playwright install chromium`).
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM ||
  (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
