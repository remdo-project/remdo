import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";
import * as envalid from "envalid";

//require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */

const env = envalid.cleanEnv(process.env, {
  VITE_WS: envalid.bool({ default: false }),
  CI: envalid.bool({ default: false }),
});

//TODO define ports as consts in a common file
//TODO load/validate env in a common file
const port = 3010;

const config: PlaywrightTestConfig = {
  testDir: "./tests/browser",
  snapshotPathTemplate:
    "{testDir}/{testFileDir}/__snapshots__/{testFileName}/{testName}_{arg}{ext}",
  /* Maximum time one test can run for. */
  timeout: 20 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 2000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!env.CI,
  retries: 0,
  workers: env.VITE_WS || env.CI ? 1 : 7,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["html", { open: "never", outputFolder: "./data/playwright-report" }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${port}/?debug=true&ws=${env.VITE_WS}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    screenshot: "off",
    //video: "retain-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },

    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],

  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: "data/test-results/",

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `PORT=${ port } SERVER_MODE=playwright npm run server`,
    port: port,
    timeout: 5 * 1000,
    reuseExistingServer: !env.CI,
  },
};

export default config;
