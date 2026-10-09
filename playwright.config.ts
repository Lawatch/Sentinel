import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/** Parcours principal sur l'application construite, reliée à un Supabase local (supabase start). */
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...(existsSync(localChromium) && !process.env.CI ? { launchOptions: { executablePath: localChromium } } : {}) },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], ...(existsSync(localChromium) && !process.env.CI ? { launchOptions: { executablePath: localChromium } } : {}) },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run start -- -p 3000', url: 'http://localhost:3000/login', reuseExistingServer: true, timeout: 120_000 },
});
