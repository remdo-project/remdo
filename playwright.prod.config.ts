import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { config } from './config';
import { chromium, playwrightBaseConfig } from './playwright.base';

// eslint-disable-next-line node/no-process-env
const { E2E_STORAGE_STATE } = process.env;

export default defineConfig({
  ...playwrightBaseConfig,
  use: {
    baseURL: config.env.APP_PUBLIC_URL,
    storageState: E2E_STORAGE_STATE,
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ['--ignore-certificate-errors'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...chromium,
      },
    },
  ],
});
