import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
import os from 'node:os';
import { config } from './config';

const host = config.env.HOST;
const port = config.env.PORT;
const baseURL = `http://${host}:${port}`;

// eslint-disable-next-line node/no-process-env
const workers = process.env.PLAYWRIGHT_WORKERS ?? Math.max(2, os.cpus().length - 1);

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  globalSetup: './tests/global/collab-server-setup.ts',
  workers,
  fullyParallel: true,
  use: {
    baseURL,
  },
  webServer: {
    command: 'pnpm run dev:web',
    url: baseURL,
    reuseExistingServer: !config.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
