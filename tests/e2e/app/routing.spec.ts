import { attachPageGuards, expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { HTTP_STATUS } from '#lib/http/status';
import { createAuthenticatedContext } from '../_support/auth-context';

interface UserProfileResponse {
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
  test('redirects the home alias to the authenticated profile home document', async ({ page }) => {
    const profileResponse = await page.request.get('/api/profile');
    expect(profileResponse.ok()).toBe(true);
    const profile = await profileResponse.json() as UserProfileResponse;

    await page.goto('/home');

    await expectPath(page, `/n/${profile.homeDocumentId}`);
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
    const profileResponse = await page.request.get('/api/profile');
    expect(profileResponse.ok()).toBe(true);
    const profile = await profileResponse.json() as UserProfileResponse;

    await page.goto('/login?next=/home');

    await expectPath(page, `/n/${profile.homeDocumentId}`);
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
      const profileResponse = await page.request.get('/api/profile');
      expect(profileResponse.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    } finally {
      detachPageGuards();
      await context.close();
    }
  });
});
