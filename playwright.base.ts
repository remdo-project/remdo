import { devices } from '@playwright/test';
import process from 'node:process';
import os from 'node:os';

// eslint-disable-next-line node/no-process-env
const { PLAYWRIGHT_WORKERS } = process.env;

export const playwrightBaseConfig = {
  testDir: 'tests/e2e',
  outputDir: 'data/test-results/playwright',
  workers: PLAYWRIGHT_WORKERS ?? Math.max(2, os.cpus().length - 1),
  fullyParallel: true,
};

export const chromium = devices['Desktop Chrome'];
