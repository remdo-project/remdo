import { expect, guardedTest as test, allowUnauthorizedNetwork } from '#e2e/fixtures';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { provisionDjangoUser } from '../../../tools/lib/django-user';
import { createFixtureDocument } from '../../../tools/lib/fixture-document';
import type { Page } from '@playwright/test';

async function presentation(page: Page) {
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
    await page.setViewportSize({ width, height: 900 });
    const alice = createTestAuthAccount();
    const bob = createTestAuthAccount();
    await provisionDjangoUser({ ...alice, admin: true });
    await provisionDjangoUser(bob);
    const id = await createFixtureDocument({ email: alice.email, title: 'Alice private document' });
    await page.goto(`/n/${id}`);
    await expect(page).toHaveURL(/\/accounts\/login\//u);
    const loginPresentation = await presentation(page);
    expect(loginPresentation.body[0]).toContain('sans-serif');
    expect(loginPresentation.body[4]).toBe('0px');
    await page.getByLabel('Email:', { exact: true }).fill(alice.email);
    await page.getByLabel('Password:', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('The email address and/or password you specified are not correct.')).toBeVisible();
    await page.getByLabel('Password:', { exact: true }).fill(alice.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/n/${id}$`, 'u'));
    await expect(page.locator('.editor-input')).toBeVisible();

    allowUnauthorizedNetwork(page);
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(page.getByRole('status')).toContainText("You're signed out");
    expect(await presentation(page)).toEqual(loginPresentation);
    await page.getByRole('link', { name: 'Sign in', exact: true }).last().click();
    await page.getByLabel('Email:', { exact: true }).fill(bob.email);
    await page.getByLabel('Password:', { exact: true }).fill(bob.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alice private document', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('remdo-pending-sign-out'))).toBeNull();
  });
}

test('native sign-in accepts an existing admin session from another tab', async ({ page, context }) => {
  const account = createTestAuthAccount();
  await provisionDjangoUser({ ...account, admin: true });
  await page.goto('/');
  await expect(page).toHaveURL(/\/accounts\/login\//u);
  const admin = await context.newPage();
  await admin.goto('/admin/');
  await admin.getByLabel('Email:', { exact: true }).fill(account.email);
  await admin.getByLabel('Password:', { exact: true }).fill(account.password);
  await admin.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Site administration' })).toBeVisible();
  // Django rotates the CSRF token at login; reload the old form to reuse the session.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await admin.close();
});
