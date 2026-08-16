import { devices } from '@playwright/test';
import process from 'node:process';
import os from 'node:os';
import { INTERNAL_SERVICE_HOST, resolveCollabServerOrigin } from '../../src/platform/net/origins.ts';

// eslint-disable-next-line node/no-process-env
const { PLAYWRIGHT_WORKERS } = process.env;

// Both suites start their own collaboration server the same way: the command
// reads the port block from the environment Playwright inherits, so the entry
// stays correct under each suite's shifted PORT_BASE and DATA_DIR.
export const collaborationWebServer = {
  name: 'collaboration',
  command: `pnpm exec y-sweet serve --host ${INTERNAL_SERVICE_HOST} --port "$COLLAB_SERVER_PORT" --auth "$YSWEET_AUTH_KEY" "$DATA_DIR/collab"`,
  url: new URL('/ready', resolveCollabServerOrigin()).href,
  // Playwright kills webServers with SIGKILL by default; give y-sweet a chance
  // to shut down its document store cleanly first.
  gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } as const,
};

export const playwrightBaseConfig = {
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  workers: PLAYWRIGHT_WORKERS ?? Math.max(2, os.cpus().length - 1),
  fullyParallel: true,
};

export const chromium = devices['Desktop Chrome'];

export const dockerBrowserUse = {
  ignoreHTTPSErrors: true,
  launchOptions: {
    args: ['--ignore-certificate-errors'],
  },
};
