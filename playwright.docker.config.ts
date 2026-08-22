import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { config } from './config';
import {
  chromium,
  collaborationWebServer,
  dockerBrowserUse,
  playwrightBaseConfig,
} from './config/playwright/base';
import { homeOrigin, sourceOrigin } from './tests/e2e/docker/_support/origins';

// eslint-disable-next-line node/no-process-env
const { E2E_STORAGE_STATE } = process.env;
const setupTestMatch = /docker\/setup\.spec\.ts/u;

export default defineConfig({
  ...playwrightBaseConfig,
  workers: 1,
  // Not a setup project: the `setup` project below is selected away whenever a
  // run names its own tests, and tools/docker-test.sh does exactly that for the
  // bridge smoke. globalSetup runs regardless of test selection.
  globalSetup: './tests/e2e/docker/_support/seed-source-user.ts',
  use: {
    baseURL: homeOrigin,
    ...dockerBrowserUse,
    trace: config.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: [
    collaborationWebServer,
    {
      name: 'source',
      // The source is public so it accepts home registration + open signup.
      command: 'ALLOW_SIGNUP=true pnpm exec vite',
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
