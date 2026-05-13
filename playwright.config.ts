import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
import os from 'node:os';
import { config } from './config';
import { resolveLoopbackHost } from './lib/net/loopback';
import { E2E_AUTH_STATE_PATH } from './tests/e2e/_support/auth-state';

const host = resolveLoopbackHost(config.env.HOST, '127.0.0.1');
// eslint-disable-next-line node/no-process-env
const { PLAYWRIGHT_WORKERS, E2E_DOCKER } = process.env;
const workers = PLAYWRIGHT_WORKERS ?? Math.max(2, os.cpus().length - 1);
const useDocker = E2E_DOCKER === 'true';
const target = useDocker
  ? {
      collabClientPort: config.env.COLLAB_CLIENT_PORT,
      hmrPort: config.env.HMR_PORT,
      port: config.env.PORT,
      protocol: 'https',
      remdoApiPort: config.env.REMDO_API_PORT,
      ySweetConnectionString: config.env.YSWEET_CONNECTION_STRING,
    }
  : {
      collabClientPort: config.env.E2E_COLLAB_CLIENT_PORT,
      hmrPort: config.env.E2E_HMR_PORT,
      port: config.env.E2E_PORT,
      protocol: 'http',
      remdoApiPort: config.env.E2E_REMDO_API_PORT,
      ySweetConnectionString: config.env.E2E_YSWEET_CONNECTION_STRING,
    };
const port = target.port;
const protocol = target.protocol;
const baseURL = `${protocol}://${host}:${port}`;

const webServer = useDocker
  ? undefined
  : {
      command: 'pnpm exec vite',
      env: {
        COLLAB_CLIENT_PORT: String(target.collabClientPort),
        HMR_PORT: String(target.hmrPort),
        PORT: String(port),
        REMDO_API_PORT: String(target.remdoApiPort),
        YSWEET_CONNECTION_STRING: target.ySweetConnectionString,
      },
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
    storageState: useDocker ? undefined : E2E_AUTH_STATE_PATH,
    ignoreHTTPSErrors: useDocker,
    launchOptions: useDocker
      ? {
          args: ['--ignore-certificate-errors'],
        }
      : undefined,
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
