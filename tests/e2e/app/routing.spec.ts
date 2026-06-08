import { attachPageGuards, expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { HTTP_STATUS } from '#platform/http/status';
import { createAuthenticatedContext } from '../_support/auth-context';

interface CurrentUserBootstrapResponse {
  homeDocumentId: string;
}

async function expectPath(page: Page, pathname: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

async function createIndexedDb(page: Page, dbName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const request = indexedDB.open(name);
    await new Promise<void>((resolve, reject) => {
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      });
      request.addEventListener('error', () => reject(request.error ?? new Error(`Failed to open ${name}.`)));
    });
  }, dbName);
}

async function hasIndexedDb(page: Page, dbName: string): Promise<boolean> {
  return page.evaluate(async (name) => {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === name);
  }, dbName);
}

test.describe('Routing', () => {
  test('redirects the home alias to the authenticated bootstrap home document', async ({ page }) => {
    const bootstrapResponse = await page.request.get('/api/current-user');
    expect(bootstrapResponse.ok()).toBe(true);
    const bootstrap = await bootstrapResponse.json() as CurrentUserBootstrapResponse;

    await page.goto('/home');

    await expectPath(page, `/n/${bootstrap.homeDocumentId}`);
  });

  test('redirects the home alias to login with a next target when unauthenticated', async ({
    browser,
    contextOptions,
  }) => {
    const context = await browser.newContext({
      ...contextOptions,
      storageState: {
        cookies: [],
        origins: [],
      },
    });
    const page = await context.newPage();
    const detachPageGuards = attachPageGuards(page);
    try {
      await page.goto('/home');

      await expectPath(page, '/login');
      expect(new URL(page.url()).searchParams.get('next')).toBe('/home');
    } finally {
      detachPageGuards();
      await context.close();
    }
  });

  test('resolves a home next target after login', async ({ page }) => {
    const bootstrapResponse = await page.request.get('/api/current-user');
    expect(bootstrapResponse.ok()).toBe(true);
    const bootstrap = await bootstrapResponse.json() as CurrentUserBootstrapResponse;

    await page.goto('/login?next=/home');

    await expectPath(page, `/n/${bootstrap.homeDocumentId}`);
  });

  test('logs out the active session from the app header', async ({ browser, contextOptions }) => {
    const context = await createAuthenticatedContext(browser, contextOptions);
    const page = await context.newPage();
    const detachPageGuards = attachPageGuards(page);
    try {
      await page.goto('/home');
      await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
      await createIndexedDb(page, 'y-sweet-logout-test');

      await page.getByRole('link', { name: 'Logout' }).click();

      await expectPath(page, '/login');
      await expect.poll(async () => hasIndexedDb(page, 'y-sweet-logout-test')).toBe(false);
      const bootstrapResponse = await page.request.get('/api/current-user');
      expect(bootstrapResponse.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    } finally {
      detachPageGuards();
      await context.close();
    }
  });
});
