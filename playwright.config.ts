import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";
import { env } from "#env";

const webServer: PlaywrightTestConfig["webServer"] = [
  {
    command: `npm run preview -- --host --port ${env.PORT}`,
    port: env.PORT,
    timeout: 5 * 1000,
    reuseExistingServer: !env.CI,
  },
];

if (env.FORCE_WEBSOCKET) {
  webServer.push({
    command: "npm run websocket",
    port: 8080,
    timeout: 5 * 1000,
    reuseExistingServer: !env.CI,
  });
}

const config: PlaywrightTestConfig = {
  testDir: "./tests/browser",
  snapshotPathTemplate:
    "{testDir}/{testFileDir}/__snapshots__/{testFileName}/{testName}_{arg}{ext}",
  /* Maximum time one test can run for. */
  timeout: 20 * 1000,
  expect: {
    timeout: 2000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!env.CI,
  retries: 0,
  workers: env.FORCE_WEBSOCKET ? 1 : undefined,
  /* Reporters: keep terminal-friendly + HTML report on disk */
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "./data/playwright-report" }],
  ],
  use: {
    baseURL: `http://localhost:${env.PORT}`,

    screenshot: "only-on-failure",
    //video: "retain-on-failure",
  },
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
  outputDir: "data/test-results/",
  webServer,
};

export default config;
