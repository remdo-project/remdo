import type { Page } from '#e2e/fixtures';
import { setExpectedConsoleIssues } from '#e2e/fixtures';
import process from 'node:process';

// eslint-disable-next-line node/no-process-env
const AUTH_USER = process.env.AUTH_USER;
// eslint-disable-next-line node/no-process-env
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

function getDockerAuth() {
  if (!AUTH_USER || !AUTH_PASSWORD) {
    throw new Error('Prod e2e tests require AUTH_USER and AUTH_PASSWORD.');
  }
  return {
    user: AUTH_USER,
    password: AUTH_PASSWORD,
  };
}

export async function loginThroughTinyauthIfNeeded(page: Page): Promise<void> {
  await page.waitForURL(/\/(login|n\/)/, { timeout: 15_000 });
  if (!page.url().includes('/login')) {
    return;
  }
  const dockerAuth = getDockerAuth();
  await page.fill('input[autocomplete="username"]', dockerAuth.user);
  await page.fill('input[autocomplete="current-password"]', dockerAuth.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/n\//, { timeout: 15_000 });
}

export async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export function allowOfflineDisconnectedConsoleIssue(page: Page): void {
  setExpectedConsoleIssues(
    page,
    ['net::ERR_INTERNET_DISCONNECTED', 'Failed to get client token'],
    { mode: 'allowContains' },
  );
}
