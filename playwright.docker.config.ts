import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { config } from './config';
import { chromium, dockerBrowserUse, playwrightBaseConfig } from './config/playwright/base';

// eslint-disable-next-line node/no-process-env
const { E2E_STORAGE_STATE } = process.env;
const sourceOrigin = `http://localhost:${config.env.PORT}`;
const setupTestMatch = /docker\/setup\.spec\.ts/u;

export default defineConfig({
  ...playwrightBaseConfig,
  workers: 1,
  use: {
    baseURL: config.env.APP_PUBLIC_URL,
    ...dockerBrowserUse,
  },
  webServer: [
    {
      name: 'source',
      command: `AUTH_URL=${sourceOrigin} pnpm exec tsx ./tools/e2e/docker-source-server.ts`,
      url: sourceOrigin,
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: setupTestMatch,
      use: {
        ...chromium,
      },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: /docker\/.*\.spec\.ts/u,
      testIgnore: setupTestMatch,
      use: {
        ...chromium,
        storageState: E2E_STORAGE_STATE,
      },
    },
  ],
});
