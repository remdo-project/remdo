import { defineConfig, devices } from '@playwright/test';
import { config } from './config';

const host = config.env.HOST;
const port = config.env.PORT;
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  globalSetup: './tests/global/collab-server-setup.ts',
  use: {
    baseURL,
  },
  webServer: {
    command: 'pnpm run dev:web',
    url: baseURL,
    reuseExistingServer: !config.env.CI,
    timeout: 6e4,
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
