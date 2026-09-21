import { expect, guardedTest as test, allowUnauthorizedNetwork, setExpectedConsoleIssues } from '#e2e/fixtures';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { provisionDjangoUser } from '../../../tools/lib/django-user';
import { createFixtureDocument } from '../../../tools/lib/fixture-document';
import type { Page } from '@playwright/test';

async function presentation(page: Page) {
  // The computed styles below are read once, so a snapshot taken before the
  // stylesheet applies would compare unstyled defaults against styled ones.
  await expect(page.locator('body')).toHaveCSS('font-family', /sans-serif/u);
  return page.evaluate(() => {
    const style = (selector: string, properties: string[]) => {
      const computed = getComputedStyle(document.querySelector(selector)!);
      return properties.map(property => computed.getPropertyValue(property));
    };
    return {
      body: style('body', ['font-family', 'font-size', 'color', 'background-color', 'margin']),
      header: style('header', ['background-color', 'backdrop-filter']),
      card: style('.remdo-card', ['width', 'padding', 'border', 'border-radius', 'background-color']),
      title: style('h1', ['font-family', 'font-size', 'font-weight', 'line-height']),
      action: style('.remdo-account-button', ['background-color', 'color', 'border-radius', 'height']),
    };
  });
}

// Use the actual native form so redirect and browser-storage behavior are covered together.
for (const width of [1280, 390]) {
  test(`native sign-in preserves a document target, logout, and account isolation at ${width}px`, async ({ page }) => {
    // Two accounts and two sign-ins that each cold-load the app.
    test.slow();
    await page.setViewportSize({ width, height: 900 });
    const alice = createTestAuthAccount();
    const bob = createTestAuthAccount();
    await provisionDjangoUser({ ...alice, admin: true });
    await provisionDjangoUser(bob);
    const id = await createFixtureDocument({ email: alice.email, title: 'Alice private document' });
    await page.goto(`/n/${id}`);
    await page.waitForURL(/\/accounts\/login\//u);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sign in', exact: true }).click();
    const loginPresentation = await presentation(page);
    expect(loginPresentation.body[4]).toBe('0px');
    await page.getByLabel('Email:', { exact: true }).fill(alice.email);
    await page.getByLabel('Password:', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('The email address and/or password you specified are not correct.')).toBeVisible();
    await page.getByLabel('Password:', { exact: true }).fill(alice.password);
    let revocationHeld = false;
    await page.route('**/api/auth/browser/v1/auth/session', async (route) => {
      if (route.request().method() !== 'DELETE' || revocationHeld) return route.continue();
      revocationHeld = true;
      expect(await page.locator('.editor-input').count()).toBe(0);
      const response = await route.fetch();
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(new RegExp(`/n/${id}$`, 'u'));
    // Signing in leaves the login page, so the editor follows a cold SPA load.
    await expect(page.locator('.editor-input')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);

    // Model edits left by a closed tab to exercise explicit discard on logout.
    await page.evaluate(() => localStorage.setItem('remdo-unsynced:document:closed-tab', '1'));
    allowUnauthorizedNetwork(page);
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out and discard', exact: true }).click();
    await expect(page.getByRole('status')).toContainText("You're signed out");
    expect(await presentation(page)).toEqual(loginPresentation);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email:', { exact: true }).fill(bob.email);
    await page.getByLabel('Password:', { exact: true }).fill(bob.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('/');
    // Signing in as the second account cold-loads the app shell again.
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 15_000 });
    // Anchor on Bob's own starter document so the listing has resolved; the
    // heading alone renders before it, making the absence check vacuous.
    await expect(
      page.getByRole('group', { name: 'Current Server', exact: true })
        .getByRole('button', { name: 'New Document', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Alice private document', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('remdo-pending-sign-out'))).toBeNull();
    await page.goto('/about/');
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveText(['About', 'Sharing', 'Sign out…']);
  });
}

test('native sign-in accepts an existing admin session from another tab', async ({ page, context }) => {
  const account = createTestAuthAccount();
  await provisionDjangoUser({ ...account, admin: true });
  await page.goto('/');
  await page.waitForURL(/\/accounts\/login\//u);
  const admin = await context.newPage();
  await admin.goto('/admin/');
  await admin.getByLabel('Email:', { exact: true }).fill(account.email);
  await admin.getByLabel('Password:', { exact: true }).fill(account.password);
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Site administration' })).toBeVisible();
  // Django rotates the CSRF token at login; reload the old form to reuse the session.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 15_000 });
  await admin.close();
});

test('admin sign-in supersedes an unfinished logout in another tab', async ({ page, context }) => {
  const previous = createTestAuthAccount();
  const administrator = createTestAuthAccount();
  await provisionDjangoUser(previous);
  await provisionDjangoUser({ ...administrator, admin: true });
  await page.goto('/accounts/login/');
  await page.getByLabel('Email:', { exact: true }).fill(previous.email);
  await page.getByLabel('Password:', { exact: true }).fill(previous.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 15_000 });
  setExpectedConsoleIssues(page, ['net::ERR_FAILED'], { mode: 'allowContains' });
  await page.route('**/api/auth/browser/v1/auth/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      // Revocation succeeds, but its lost response leaves this device's logout
      // pending. The next admin visit can authenticate through shared sign-in.
      await route.fetch();
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  const pendingNotice = page.getByText('Local data cleared. Signing in finishes signing out first.');
  await expect(pendingNotice).toBeVisible();
  await page.unroute('**/api/auth/browser/v1/auth/session');
  const revocations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE') revocations.push(request.url());
  });

  const admin = await context.newPage();
  await admin.goto('/admin/login/?next=/admin/accounts/user/');
  await admin.getByLabel('Email:', { exact: true }).fill(administrator.email);
  await admin.getByLabel('Password:', { exact: true }).fill(administrator.password);
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin).toHaveURL(/\/admin\/accounts\/user\/$/u);
  expect(await admin.evaluate(() => localStorage.getItem('remdo-pending-sign-out'))).toBeNull();
  // The storage event clears the old tab's pending state without sending its
  // stale revocation.
  await expect(pendingNotice).toHaveCount(0);
  expect(revocations).toEqual([]);
  const session = await context.request.get('/api/auth/browser/v1/auth/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).data.user.email).toBe(administrator.email);
  await admin.reload();
  await expect(admin).toHaveURL(/\/admin\/accounts\/user\/$/u);
  await admin.close();
});
