import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
import os from 'node:os';
import { config } from './config';
import { resolveLoopbackHost } from './lib/net/loopback';

const host = resolveLoopbackHost(config.env.HOST, '127.0.0.1');
// eslint-disable-next-line node/no-process-env
const { PLAYWRIGHT_WORKERS, E2E_DOCKER } = process.env;
const workers = PLAYWRIGHT_WORKERS ?? Math.max(2, os.cpus().length - 1);
const useDocker = E2E_DOCKER === 'true';
const port = useDocker ? config.env.PORT : config.env.PLAYWRIGHT_WEB_PORT;
const baseURL = `http://${host}:${port}`;

const webServer = useDocker
  ? undefined
  : {
      command: `./tools/env.sh sh -c 'PORT=${port} pnpm exec vite'`,
      url: baseURL,
      // Reusing an existing server can accidentally target preview/prod-mode
      // instances (e.g. dev:pwa) that do not expose /e2e routes.
      reuseExistingServer: false,
    };

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  globalSetup: './tests/global/collab-server-setup.ts',
  workers,
  fullyParallel: true,
  use: {
    baseURL,
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
