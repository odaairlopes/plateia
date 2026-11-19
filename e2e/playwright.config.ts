import { defineConfig, devices } from '@playwright/test';

const SITE_PORT = Number(process.env.E2E_PORT ?? 4173);
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';
const CI = Boolean(process.env.CI);

/**
 * End-to-end tests against the production web build (dist-web) and a running
 * backend behind the gateway. Locally: `npm run dev:services` (the gateway is
 * started here); in CI: the production Docker image already listens on 8080.
 */
export default defineConfig({
  testDir: '.',
  // The specs share one database and one set of seats: run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: {
    baseURL: `http://127.0.0.1:${SITE_PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'gateway',
      // Same gateway as production. /health answers 503 until every service is
      // ready, so Playwright waits for the whole backend, not just the port.
      command: 'node deploy/backend/gateway.mjs',
      cwd: '..',
      url: `${API_URL}/health`,
      env: { PORT: new URL(API_URL).port || '8080' },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      name: 'site',
      command: 'node e2e/serve.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${SITE_PORT}`,
      env: { E2E_PORT: String(SITE_PORT), E2E_API_URL: API_URL },
      reuseExistingServer: !CI,
    },
  ],
});
