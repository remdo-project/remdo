import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { config } from './config';
import { chromium, dockerBrowserUse, playwrightBaseConfig } from './config/playwright/base';

// eslint-disable-next-line node/no-process-env
const { E2E_STORAGE_STATE, REMDO_E2E_HOME_ORIGIN, REMDO_E2E_SOURCE_ORIGIN } = process.env;
// Host networking lets both the browser and container reach the source through
// the same localhost origin.
const sourceOrigin = REMDO_E2E_SOURCE_ORIGIN ?? `http://localhost:${config.env.PORT}`;
if (!REMDO_E2E_HOME_ORIGIN) {
  throw new Error('REMDO_E2E_HOME_ORIGIN is required for Docker E2E.');
}
const setupTestMatch = /docker\/setup\.spec\.ts/u;

export default defineConfig({
  ...playwrightBaseConfig,
  workers: 1,
  use: {
    baseURL: REMDO_E2E_HOME_ORIGIN,
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
