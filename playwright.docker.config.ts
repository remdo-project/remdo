import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { chromium, dockerBrowserUse, playwrightBaseConfig } from './config/playwright/base';
import { homeOrigin, sourceOrigin } from './tests/e2e/docker/_support/origins';

// eslint-disable-next-line node/no-process-env
const { E2E_STORAGE_STATE } = process.env;
const setupTestMatch = /docker\/setup\.spec\.ts/u;

export default defineConfig({
  ...playwrightBaseConfig,
  workers: 1,
  use: {
    baseURL: homeOrigin,
    ...dockerBrowserUse,
  },
  webServer: [
    {
      name: 'source',
      // The source is public so it accepts home registration + open signup.
      command: 'ALLOW_SIGNUP=true pnpm exec tsx ./tools/e2e/docker-source-server.ts',
      url: `${sourceOrigin}/api/health`,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
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
