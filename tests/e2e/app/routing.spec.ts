import {
  allowUnauthorizedNetwork,
  collectCurrentUserRequests,
  setExpectedConsoleIssues,
  expect,
  test,
  unauthenticatedTest,
} from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { createUserDocument } from '../_support/documents';

test('Sharing remains recoverable when a remembered session has no offline bootstrap', async ({ page }) => {
  await page.goto('/about/');
  await page.evaluate(() => {
    localStorage.setItem('remdo-authenticated-session', '1');
    localStorage.removeItem('remdo-current-user-bootstrap');
  });
  setExpectedConsoleIssues(page, ['net::ERR_FAILED'], { mode: 'allowContains' });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/sharing');
  await expect(page).toHaveURL(/\/sharing$/u);
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sharing', exact: true })).toBeVisible();
});

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
  test('ignores retired OAuth parameters during signed-in navigation', async ({ page }) => {
    await page.goto('/?response_type=code&client_id=legacy&redirect_uri=https%3A%2F%2Fsource.test%2Fcallback&next=%2Fsharing');

    await expectPath(page, '/sharing');
    await expect(page.getByRole('heading', { level: 1, name: 'Sharing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link source' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Linked sources' })).toHaveCount(0);
  });

  test('keeps Home and a document at distinct reloadable URLs', async ({ page }) => {
    const document = await createUserDocument(page, 'Routing document');
    const documentPath = `/n/${document.id}`;

    await page.goto('/');
    await expectPath(page, '/');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();
    await expect(page.locator('.document-editor-shell')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();

    // An explicit post-login document target must not collapse into Home.
    await page.goto(`/?next=${encodeURIComponent(documentPath)}`);
    await expectPath(page, documentPath);
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
    await page.reload();
    await expectPath(page, documentPath);
    await expect(page.locator('.document-editor-shell')).toBeVisible();
  });

  test('opens server-rendered About from Home and document navigation', async ({ page }) => {
    const document = await createUserDocument(page, 'About navigation');

    for (const path of ['/', `/n/${document.id}`]) {
      await page.goto(path);
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'About', exact: true }).click();
      await expectPath(page, '/about/');
      await expect(page.getByRole('article')).toBeVisible();
      await expect(page.locator('script[type="module"]')).toHaveCount(0);
    }
  });

  test('reloads Home while its document listing is pending', async ({ page }) => {
    let heldFirstRequest = false;
    await page.route('**/api/documents', async (route) => {
      if (!heldFirstRequest) {
        heldFirstRequest = true;
        return;
      }
      await route.continue();
    });
    const documentsRequested = page.waitForRequest('**/api/documents');
    await page.goto('/');
    await documentsRequested;
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();
    await expect(page.getByRole('group', { name: 'Current Server', exact: true })
      .getByRole('button', { name: 'New Document', exact: true })).toBeVisible();
  });

  unauthenticatedTest('uses native sign-in and preserves protected destinations when signed out', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    for (const destination of ['/', '/sharing', '/n/protectedDoc_note1']) {
      await page.goto(destination);
      await expectPath(page, '/accounts/login/');
      const next = new URL(page.url()).searchParams.get('next')!;
      if (destination === '/') {
        expect(next).toBe('/');
      } else {
        expect(new URL(next, page.url()).searchParams.get('next')).toBe(destination);
      }
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      expect(userDataRequests).toEqual([]);
    }
  });

  test('normalizes the default landing target to the authenticated root', async ({ page }) => {
    await page.goto('/?next=%2F');

    await expectPath(page, '/');
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  });

  test('renders Sharing as a standard authenticated page', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/sharing');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Sharing' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toContain('/api/current-user');
  });

  test('keeps native administration outside user data', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/admin');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Site administration' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  unauthenticatedTest('uses shared sign-in for administration outside user data', async ({ page }) => {
    const userDataRequests = collectCurrentUserRequests(page);
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/accounts\/login\//u);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByLabel('Email:', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(userDataRequests).toEqual([]);
  });

  test('logs out the active session from the app header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await createIndexedDb(page, 'remdo-encrypted-v1-logout-test');
    const navigations = await countNavigations(page);

    allowUnauthorizedNetwork(page);
    await page.getByRole('button', { name: 'Logout' }).click();

    await expectPath(page, '/');
    await expect(page.getByRole('status')).toContainText(/signed out/i);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeFocused();
    await expect.poll(async () => hasIndexedDb(page, 'remdo-encrypted-v1-logout-test')).toBe(false);
    // Logout replaces the view in place; a reload would add a navigation entry.
    expect(await countNavigations(page)).toBe(navigations);
    const bootstrapStatus = await page.evaluate(async () => (await fetch('/api/current-user')).status);
    expect(bootstrapStatus).toBe(403);
  });

  test('signs out every tab sharing the browser storage', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

    const peer = await context.newPage();
    await peer.goto('/');
    await expect(peer.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

    allowUnauthorizedNetwork(page);
    await page.getByRole('button', { name: 'Logout' }).click();

    // The peer stops using its local data as soon as the broadcast lands; the
    // login view follows a loader round-trip, so allow for a slow one.
    await expect(peer.getByRole('button', { name: 'Logout' })).toBeHidden({ timeout: 15_000 });
    await expect(peer.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible({ timeout: 15_000 });
    // The peer reaches the login view on the sign-out broadcast, which precedes
    // revocation; until it is confirmed the status reports an incomplete
    // sign-out, so allow for that confirmation round-trip.
    await expect(peer.getByRole('status')).toContainText(/signed out/i, { timeout: 15_000 });
    await peer.close();
  });
});

unauthenticatedTest('renders repository public pages without loading the app', async ({ page }) => {
  const userDataRequests = collectCurrentUserRequests(page);
  const response = await page.goto('/about');
  expect(response!.status()).toBe(200);
  await expect(page).toHaveURL(/\/about\/$/u);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL('/about/', page.url()).href);
  await expect(page.locator('script[type="module"]')).toHaveCount(0);
  expect(userDataRequests).toEqual([]);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'RemDo home', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'About', exact: true })).toBeFocused();
});
