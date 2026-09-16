import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { chromium, dockerBrowserUse, playwrightBaseConfig } from './config/playwright/base';

// eslint-disable-next-line node/no-process-env -- The Docker launcher owns the isolated instance.
const { DOCKER_TEST_ORIGIN } = process.env;

export default defineConfig({
  ...playwrightBaseConfig,
  fullyParallel: false,
  workers: 1,
  testMatch: /docker\/production\.spec\.ts/u,
  use: {
    ...chromium,
    ...dockerBrowserUse,
    baseURL: DOCKER_TEST_ORIGIN,
  },
});
