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
const hmrPort = useDocker ? config.env.HMR_PORT : config.env.PLAYWRIGHT_HMR_PORT;

const webServer = useDocker
  ? undefined
  : {
      command: `./tools/env.sh env PORT=${port} HMR_PORT=${hmrPort} pnpm exec vite`,
      url: baseURL,
      // Intentional: reuse an already-running RemDo Vite dev server on PLAYWRIGHT_WEB_PORT
      // to keep local E2E/debug loops fast. This port is expected to be reserved for the
      // test target; if another app is bound there, E2E results are invalid.
      reuseExistingServer: true,
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
