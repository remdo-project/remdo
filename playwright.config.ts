import { defineConfig } from '@playwright/test';
import { config } from './config';
import { resolveAppOrigin } from './lib/net/origins';
import { chromium, playwrightBaseConfig } from './playwright.base';
import { E2E_STORAGE_STATE_PATH } from './tests/e2e/_support/auth-state';

const baseURL = resolveAppOrigin({ loopback: true });
const reuseExistingServer = !config.env.CI;

const webServer = [
  {
    name: 'collab',
    command: 'pnpm run dev:collab',
    port: config.env.COLLAB_SERVER_PORT,
    reuseExistingServer,
    gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 5000 },
  },
  {
    name: 'app',
    command: 'pnpm exec vite',
    url: baseURL,
    reuseExistingServer,
  },
];

export default defineConfig({
  ...playwrightBaseConfig,
  use: {
    baseURL,
    storageState: E2E_STORAGE_STATE_PATH,
  },
  webServer,
  projects: [
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/u,
      use: {
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: [
        /(^|\/)smoke\.spec\.ts$/u,
        /app\/.*\.spec\.ts/u,
        /editor\/.*\.spec\.ts/u,
      ],
      use: {
        ...chromium,
      },
    },
  ],
});
