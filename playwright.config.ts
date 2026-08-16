import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { config } from './config';
import { resolveLocalGatewayOrigin } from './src/platform/net/origins';
import { chromium, collaborationWebServer, playwrightBaseConfig } from './config/playwright/base';

const baseURL = resolveLocalGatewayOrigin();
const apiHealthURL = new URL('/api/health', baseURL).href;

export default defineConfig({
  ...playwrightBaseConfig,
  outputDir: path.join(config.env.DATA_DIR, 'test-results', 'playwright'),
  webServer: [
    collaborationWebServer,
    {
      command: 'pnpm exec vite',
      name: 'app',
      url: apiHealthURL,
    },
  ],
  use: {
    baseURL,
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
