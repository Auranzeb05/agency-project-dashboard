import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --import tsx apps/api/src/index.ts',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !process.env.CI,
      env: { NODE_ENV: 'test', JOBS_ENABLED: 'false' },
    },
    {
      command: 'npm run dev -w apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
