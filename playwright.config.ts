import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { config } from './config';
import { resolveAppOrigin } from './src/platform/net/origins';
import { chromium, playwrightBaseConfig } from './config/playwright/base';

const baseURL = resolveAppOrigin();
const apiHealthURL = new URL('/api/health', baseURL).href;
const collaborationReadyURL = `http://127.0.0.1:${config.env.COLLAB_SERVER_PORT}/ready`;

export default defineConfig({
  ...playwrightBaseConfig,
  outputDir: path.join(config.env.DATA_DIR, 'test-results', 'playwright'),
  webServer: [
    {
      command: 'pnpm exec y-sweet serve --host 127.0.0.1 --port "$COLLAB_SERVER_PORT" --auth "$YSWEET_AUTH_KEY" "$DATA_DIR/collab"',
      name: 'collaboration',
      url: collaborationReadyURL,
    },
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
      },
    },
  ],
});
