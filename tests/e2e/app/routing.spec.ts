import {
  allowUnauthorizedNetwork,
  collectCurrentUserRequests,
  expect,
  test,
  unauthenticatedTest,
} from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import type { CurrentUserBootstrap } from '#domain/documents/user-data';
import { HTTP_STATUS } from '#platform/http/status';

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

async function countNavigations(page: Page): Promise<number> {
  return page.evaluate(() => performance.getEntriesByType('navigation').length);
}

async function hasIndexedDb(page: Page, dbName: string): Promise<boolean> {
  return page.evaluate(async (name) => {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === name);
  }, dbName);
}

test.describe('Routing', () => {
  test('renders the authenticated Home document at the canonical root URL', async ({ page }) => {
    const bootstrapResponse = await page.request.get('/api/current-user');
    expect(bootstrapResponse.ok()).toBe(true);
    const bootstrap = await bootstrapResponse.json() as Pick<CurrentUserBootstrap, 'homeDocumentId'>;

    await page.goto('/');

    await expectPath(page, '/');
    await expect(page.locator('.document-editor-shell')).toBeVisible();
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);

    await page.goto(`/n/${bootstrap.homeDocumentId}`);

    await expectPath(page, '/');
    await expect(page.locator('.document-editor-shell')).toBeVisible();
  });

  unauthenticatedTest('uses the root login entry and preserves a protected next target when unauthenticated', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/');

    await expectPath(page, '/');
    expect(new URL(page.url()).search).toBe('');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);

    await page.goto('/sharing');

    await expectPath(page, '/');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/sharing');
    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sharing' })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  test('normalizes the default landing target to the authenticated root', async ({ page }) => {
    await page.goto('/?next=%2F');

    await expectPath(page, '/');
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await expect(page.locator('.document-editor-shell')).toBeVisible();
  });

  test('keeps full authenticated navigation on the standalone consent route', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/oauth/consent?client_id=test-client');

    await expect(page.getByRole('heading', { name: 'Authorize access' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sharing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  test('renders Sharing as a standard authenticated page', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/sharing');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Sharing' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toContain('/api/current-user');
  });

  test('starts user data for a direct authenticated admin page', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/admin');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toContain('/api/current-user');
  });

  unauthenticatedTest('keeps unauthenticated admin enrollment outside user data', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/admin');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Become admin' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  test('logs out the active session from the app header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
    await createIndexedDb(page, 'y-sweet-logout-test');
    const navigations = await countNavigations(page);

    allowUnauthorizedNetwork(page);
    await page.getByRole('button', { name: 'Logout' }).click();

    await expectPath(page, '/');
    await expect(page.getByRole('status')).toContainText(/signed out/i);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeFocused();
    await expect.poll(async () => hasIndexedDb(page, 'y-sweet-logout-test')).toBe(false);
    // Logout replaces the view in place; a reload would add a navigation entry.
    expect(await countNavigations(page)).toBe(navigations);
    const bootstrapResponse = await page.request.get('/api/current-user');
    expect(bootstrapResponse.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  test('signs out every tab sharing the browser storage', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);

    const peer = await context.newPage();
    await peer.goto('/');
    await expect(peer.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);

    allowUnauthorizedNetwork(page);
    await page.getByRole('button', { name: 'Logout' }).click();

    // The peer stops using its local data as soon as the broadcast lands; the
    // login view follows a loader round-trip, so allow for a slow one.
    await expect(peer.getByRole('button', { name: 'Logout' })).toBeHidden({ timeout: 15_000 });
    await expect(peer.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible({ timeout: 15_000 });
    await expect(peer.getByRole('status')).toContainText(/signed out/i);
    await peer.close();
  });
});
