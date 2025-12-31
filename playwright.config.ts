import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
import os from 'node:os';
import { config } from './config';

const host = config.env.HOST;
const port = config.env.PORT;
const baseURL = `http://${host}:${port}`;

// eslint-disable-next-line node/no-process-env
const { PLAYWRIGHT_WORKERS, E2E_DOCKER, BASICAUTH_USER, BASICAUTH_PASSWORD } = process.env;
const workers = PLAYWRIGHT_WORKERS ?? Math.max(2, os.cpus().length - 1);
const useDocker = E2E_DOCKER === 'true';
const httpCredentials =
  BASICAUTH_USER && BASICAUTH_PASSWORD
    ? {
        username: BASICAUTH_USER,
        password: BASICAUTH_PASSWORD,
      }
    : undefined;

const webServer = useDocker
  ? undefined
  : {
      command: 'pnpm run dev:web',
      url: baseURL,
      reuseExistingServer: !config.env.CI,
    };

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  globalSetup: './tests/global/collab-server-setup.ts',
  workers,
  fullyParallel: true,
  use: {
    baseURL,
    ...(httpCredentials ? { httpCredentials } : {}),
  },
  ...(webServer ? { webServer } : {}),
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
