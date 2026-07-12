import type { Page } from '#e2e/fixtures';
import { attachPageGuards, expect, setExpectedConsoleIssues } from '#e2e/fixtures';
import { config } from '#config';
import type { BrowserContext } from '@playwright/test';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';

export const DOCKER_TEST_AUTH = STABLE_AUTH_USERS.bob;
export const DOCKER_TEST_ADMIN_SECRET = config.env.ADMIN_SECRET;

export function allowTransientTokenFetchConsoleIssue(page: Page): void {
  setExpectedConsoleIssues(page, ['Failed to get client token'], { mode: 'allowContains' });
}

export async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  allowTransientTokenFetchConsoleIssue(page);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export async function waitForEditableEditor(page: Page): Promise<void> {
  const editorInput = page.locator('.editor-input').first();
  await editorInput.waitFor({ state: 'visible' });
  await expect(editorInput).toHaveAttribute('contenteditable', 'true');
}

export function allowOfflineDisconnectedConsoleIssue(page: Page): void {
  setExpectedConsoleIssues(
    page,
    // Offline `/api/*` requests are handled by the service worker's NetworkOnly
    // route. Chromium surfaces a service-worker-mediated offline fetch failure as
    // `net::ERR_FAILED` rather than the bare `net::ERR_INTERNET_DISCONNECTED`, and
    // which code wins is timing-dependent, so both are expected here.
    ['net::ERR_INTERNET_DISCONNECTED', 'net::ERR_FAILED', 'Failed to get client token'],
    { mode: 'allowContains' },
  );
}

export function allowServerUnavailableConsoleIssue(page: Page): void {
  setExpectedConsoleIssues(
    page,
    ['net::ERR_FAILED', 'Failed to fetch', 'Failed to get client token'],
    { mode: 'allowContains' },
  );
}

export async function cleanupOfflineTest(
  context: BrowserContext,
  page: Page | undefined,
  detachGuards: (() => void) | undefined,
): Promise<void> {
  let cleanupError: unknown;
  try {
    detachGuards?.();
  } catch (error) {
    cleanupError = error;
  }
  if (page) {
    try {
      await page.close();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  try {
    await context.setOffline(false);
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) {
    throw cleanupError;
  }
}

export async function withOfflinePage(
  context: BrowserContext,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  let page: Page | undefined;
  let detachGuards: (() => void) | undefined;
  await context.setOffline(true);
  try {
    page = await context.newPage();
    detachGuards = attachPageGuards(page);
    allowOfflineDisconnectedConsoleIssue(page);
    await run(page);
  } finally {
    await cleanupOfflineTest(context, page, detachGuards);
  }
}
