import { allowUnauthorizedNetwork, expect, test, unauthenticatedTest } from '#e2e/fixtures';

test('header controls are reachable by keyboard on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();

  for (const control of await page.getByRole('banner').locator('a, button').all()) {
    await control.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
  }
});

unauthenticatedTest('opens About from the native sign-in header', async ({ page }) => {
  await page.goto('/accounts/login/');
  const navigation = page.getByRole('navigation', { name: 'Primary' });
  await expect(navigation.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/about\/$/u);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveText(['About', 'Sign in']);
  await expect(navigation.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page');
  await navigation.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('public pages link to Home through the brand and retain staff navigation', async ({ page }) => {
  await page.goto('/about/');
  const navigation = page.getByRole('navigation', { name: 'Primary' });
  await expect(navigation.getByRole('link')).toHaveText(['About', 'Sharing', 'Admin', 'Sign out…']);
  await navigation.getByRole('link', { name: 'Sharing', exact: true }).click();
  // Entering from a Django page cold-loads the SPA and its session.
  await expect(page.getByRole('heading', { level: 1, name: 'Sharing' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'RemDo home', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});


test('public-page sign-out link opens the app without revoking the session until confirmed', async ({ page }) => {
  await page.goto('/about/');
  await page.getByRole('link', { name: 'Sign out…', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign out of RemDo?' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();

  await page.evaluate(() => localStorage.setItem('remdo-unsynced:document:closed-tab', '1'));
  await page.goto('/sign-out/');
  allowUnauthorizedNetwork(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Some changes have not reached the server.');
  await page.getByRole('button', { name: 'Sign out and discard', exact: true }).click();
  await expect(page.getByRole('status')).toContainText("You're signed out");

  await page.goto('/sign-out/');
  await expect(page).toHaveURL(new URL('/', page.url()).href);
});

unauthenticatedTest.describe('without JavaScript', () => {
  unauthenticatedTest.use({ javaScriptEnabled: false });
  unauthenticatedTest('public content and sign-in navigation remain usable', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.getByRole('article')).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('Email:', { exact: true })).toBeVisible();
  });
});
