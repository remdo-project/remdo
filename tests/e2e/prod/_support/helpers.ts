import type { Page } from '#e2e/fixtures';
import { expect, setExpectedConsoleIssues } from '#e2e/fixtures';
import { config } from '#config';
import type { BrowserContext } from '@playwright/test';

const DOC_URL_PATTERN = /\/n\//;

export const PROD_TEST_AUTH = {
  email: 'ci@example.com',
  name: 'CI User',
  password: 'ci-password-1234',
} as const;
export const PROD_TEST_ADMIN_SECRET = config.env.ADMIN_SECRET;

export async function authenticateIfNeeded(page: Page): Promise<void> {
  const editorShell = page.locator('.document-editor-shell').first();
  const loginButton = page.getByRole('button', { name: 'Sign in' });

  const currentState = await Promise.race([
    editorShell.waitFor({ state: 'visible' }).then(() => 'editor' as const),
    loginButton.waitFor({ state: 'visible' }).then(() => 'login' as const),
  ]);

  if (currentState === 'editor') {
    return;
  }

  await page.fill('input[autocomplete="email"]', PROD_TEST_AUTH.email);
  await page.fill('input[autocomplete="current-password"]', PROD_TEST_AUTH.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(DOC_URL_PATTERN);
  await editorShell.waitFor({ state: 'visible' });
}

export async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  setExpectedConsoleIssues(page, ['Failed to get client token'], { mode: 'allowContains' });
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
    ['net::ERR_INTERNET_DISCONNECTED', 'Failed to get client token'],
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
