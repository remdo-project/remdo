import { expect, guardedTest as test, allowUnauthorizedNetwork } from '#e2e/fixtures';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { provisionDjangoUser } from '../../../tools/lib/django-user';
import { createFixtureDocument } from '../../../tools/lib/fixture-document';

// Use the actual native form so redirect and browser-storage behavior are covered together.
test('native sign-in preserves a document target, logout, and account isolation', async ({ page }) => {
  const alice = createTestAuthAccount();
  const bob = createTestAuthAccount();
  await provisionDjangoUser({ ...alice, admin: true });
  await provisionDjangoUser(bob);
  const id = await createFixtureDocument({ email: alice.email, title: 'Alice private document' });
  await page.goto(`/n/${id}`);
  await expect(page).toHaveURL(/\/accounts\/login\//u);
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
  await page.getByRole('link', { name: 'Sign in', exact: true }).last().click();
  await page.getByLabel('Email:', { exact: true }).fill(bob.email);
  await page.getByLabel('Password:', { exact: true }).fill(bob.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alice private document', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('remdo-pending-sign-out'))).toBeNull();
});

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
