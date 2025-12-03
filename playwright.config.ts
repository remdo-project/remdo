import { defineConfig, devices } from '@playwright/test';
import { config as appConfig } from './config';

const host = appConfig.env.HOST;
const port = appConfig.env.PORT;
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  use: {
    baseURL,
  },
  webServer: {
    command: 'pnpm run e2e:server',
    url: baseURL,
    reuseExistingServer: !appConfig.env.CI,
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
