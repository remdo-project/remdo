import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { config } from './config';
import { resolveApiServerOrigin, resolveLocalGatewayOrigin } from './src/platform/net/origins';
import { chromium, collaborationWebServer, playwrightBaseConfig } from './config/playwright/base';

const baseURL = resolveLocalGatewayOrigin();
const apiHealthURL = new URL('/api/health', baseURL).href;

export default defineConfig({
  ...playwrightBaseConfig,
  outputDir: path.join(config.env.DATA_DIR, 'test-results', 'playwright'),
  webServer: [
    {
      command: 'pnpm run dev:api',
      name: 'api',
      url: new URL('/api/health', resolveApiServerOrigin()).href,
    },
    collaborationWebServer,
    {
      // Not `pnpm exec vite`: from pnpm 11.27.1 that wrapper exits while Vite, which watches stdin
      // for its parent's exit outside CI, keeps running orphaned, and the run stalls.
      command: 'vite',
      name: 'app',
      url: apiHealthURL,
    },
  ],
  use: {
    baseURL,
    // Date labels and the calendar's month/weekday names follow the runtime
    // locale, so pin it (and the zone) to keep assertions machine-independent.
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: [
        /app\/.*\.spec\.ts/u,
        /editor\/.*\.spec\.ts/u,
      ],
      use: {
        ...chromium,
        trace: config.env.CI ? 'retain-on-failure' : 'off',
      },
    },
  ],
});
