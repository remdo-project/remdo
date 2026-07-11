import { attachPageGuards, expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import type { CurrentUserBootstrap } from '#domain/documents/user-data';
import { HTTP_STATUS } from '#platform/http/status';
import { createAuthenticatedContext } from '../_support/auth-context';

async function expectPath(page: Page, pathname: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

function collectUserDataRuntimeRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/current-user') {
      requests.push(pathname);
    }
  });
  return requests;
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
    const bootstrap = await bootstrapResponse.json() as Pick<CurrentUserBootstrap, 'homeDocumentId'>;

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
    const userDataRequests = collectUserDataRuntimeRequests(page);
    try {
      await page.goto('/home');

      await expectPath(page, '/');
      expect(new URL(page.url()).searchParams.get('next')).toBe('/home');
      await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sharing' })).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      expect(userDataRequests).toEqual([]);
    } finally {
      detachPageGuards();
      await context.close();
    }
  });

  test('shows login at the bare root when unauthenticated', async ({ browser, contextOptions }) => {
    const context = await browser.newContext({
      ...contextOptions,
      storageState: {
        cookies: [],
        origins: [],
      },
    });
    const page = await context.newPage();
    const detachPageGuards = attachPageGuards(page);
    const userDataRequests = collectUserDataRuntimeRequests(page);
    try {
      await page.goto('/');

      await expectPath(page, '/');
      expect(new URL(page.url()).search).toBe('');
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(userDataRequests).toEqual([]);
    } finally {
      detachPageGuards();
      await context.close();
    }
  });

  test('resolves a home next target after login', async ({ page }) => {
    const bootstrapResponse = await page.request.get('/api/current-user');
    expect(bootstrapResponse.ok()).toBe(true);
    const bootstrap = await bootstrapResponse.json() as Pick<CurrentUserBootstrap, 'homeDocumentId'>;

    await page.goto('/?next=/home');

    await expectPath(page, `/n/${bootstrap.homeDocumentId}`);
  });

  test('keeps full authenticated navigation on the standalone consent route', async ({ page }) => {
    const userDataRequests = collectUserDataRuntimeRequests(page);
    await page.goto('/oauth/consent?client_id=test-client');

    await expect(page.getByRole('heading', { name: 'Authorize access' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sharing' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  test('renders a brand-only header without user data on the offline route', async ({ page }) => {
    const userDataRequests = collectUserDataRuntimeRequests(page);
    await page.goto('/offline');

    await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Primary' });
    await expect(navigation.getByRole('link', {
      name: /^(?:Admin|Sharing|Logout|Sign in)$/u,
    })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  test('renders Sharing as a standard authenticated page', async ({ page }) => {
    const userDataRequests = collectUserDataRuntimeRequests(page);
    await page.goto('/sharing');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Sharing' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toContain('/api/current-user');
  });

  test('starts user data for a direct authenticated admin page', async ({ page }) => {
    const userDataRequests = collectUserDataRuntimeRequests(page);
    await page.goto('/admin');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toContain('/api/current-user');
  });

  test('keeps unauthenticated admin enrollment outside user data', async ({
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
    const userDataRequests = collectUserDataRuntimeRequests(page);
    try {
      await page.goto('/admin');

      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Become admin' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(userDataRequests).toEqual([]);
    } finally {
      detachPageGuards();
      await context.close();
    }
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

      await expectPath(page, '/');
      await expect.poll(async () => hasIndexedDb(page, 'y-sweet-logout-test')).toBe(false);
      const bootstrapResponse = await page.request.get('/api/current-user');
      expect(bootstrapResponse.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    } finally {
      detachPageGuards();
      await context.close();
    }
  });
});
