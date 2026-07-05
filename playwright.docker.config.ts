import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { config } from './config';
import { chromium, dockerBrowserUse, playwrightBaseConfig } from './config/playwright/base';

// eslint-disable-next-line node/no-process-env
const { E2E_STORAGE_STATE, REMDO_E2E_SOURCE_ORIGIN } = process.env;
// The linked source's single origin (the host's network IP), set by
// docker-test.sh — reachable and identical from both the browser (on the host)
// and the containerized home, matching the same-origin model.
const sourceOrigin = REMDO_E2E_SOURCE_ORIGIN ?? `http://localhost:${config.env.PORT}`;
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
      // The source is public so it accepts home registration + open signup.
      command: `AUTH_URL=${sourceOrigin} ALLOW_SIGNUP=true pnpm exec tsx ./tools/e2e/docker-source-server.ts`,
      url: `${sourceOrigin}/api/health`,
      reuseExistingServer: false,
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
