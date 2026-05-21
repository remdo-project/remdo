import { attachPageGuards, expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { HTTP_STATUS } from '#lib/http/status';
import { createAuthenticatedContext } from '../_support/auth-context';

interface UserProfileResponse {
  homeDocumentId: string;
}

const PENDING_LOCAL_USER_DATA_CLEANUP_KEY = 'remdo-pending-local-user-data-cleanup';

async function expectPath(page: Page, pathname: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
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

  test('retries pending local cleanup before login redirects an authenticated user', async ({ page }) => {
    const profileResponse = await page.request.get('/api/profile');
    expect(profileResponse.ok()).toBe(true);
    const profile = await profileResponse.json() as UserProfileResponse;

    await page.goto('/home');
    await page.evaluate((key) => {
      localStorage.setItem(key, '1');
    }, PENDING_LOCAL_USER_DATA_CLEANUP_KEY);

    await page.goto('/login?next=/home');

    await expectPath(page, `/n/${profile.homeDocumentId}`);
    await expect.poll(async () => page.evaluate(
      (key) => localStorage.getItem(key),
      PENDING_LOCAL_USER_DATA_CLEANUP_KEY,
    )).toBeNull();
  });

  test('logs out the active session from the app header', async ({ browser, contextOptions }) => {
    const context = await createAuthenticatedContext(browser, contextOptions);
    const page = await context.newPage();
    const detachPageGuards = attachPageGuards(page);
    try {
      await page.goto('/home');
      await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);

      await page.getByRole('button', { name: 'Logout' }).click();

      await expectPath(page, '/login');
      const profileResponse = await page.request.get('/api/profile');
      expect(profileResponse.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    } finally {
      detachPageGuards();
      await context.close();
    }
  });
});
