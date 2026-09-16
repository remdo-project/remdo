import { expect, guardedTest as test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { provisionDjangoUser } from '../../../tools/lib/django-user';
import { ensureReady, waitForSynced } from '../editor/_support/bridge';

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/accounts/login/');
  await page.getByRole('textbox', { name: 'Email:', exact: true }).fill(account.email);
  await page.getByLabel(/^Password/u).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('group', { name: 'Current Server', exact: true })
    .getByRole('button', { name: 'Home', exact: true })).toBeVisible();
}

test('Django sign-in, Home creation, collaboration, reopen, and account isolation', async ({ browser, contextOptions, page }) => {
  // Three sign-ins and full-page reloads share this scenario's test budget.
  test.setTimeout(60_000);
  const account = createTestAuthAccount();
  const otherAccount = createTestAuthAccount();
  await provisionDjangoUser(account);
  await provisionDjangoUser(otherAccount);
  await signIn(page, account);
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await expect(page).toHaveURL(/\/n\/[A-Za-z0-9]+$/u);
  const documentUrl = page.url();
  const docId = new URL(documentUrl).pathname.slice(3);
  const editor = page.locator('.editor-input');
  await ensureReady(page);
  await expect(editor).toBeEditable();
  await editor.click();
  await page.keyboard.type('Django document content');
  await waitForSynced(page);

  const peerContext = await browser.newContext(contextOptions);
  try {
    const peer = await peerContext.newPage();
    await signIn(peer, account);
    await peer.goto(documentUrl);
    await ensureReady(peer);
    await expect(peer.locator('.editor-input')).toContainText('Django document content');
    await expect(peer.locator('.editor-input')).toBeEditable();
    await peer.locator('.editor-input').click();
    await peer.keyboard.press('ControlOrMeta+End');
    await peer.keyboard.type(' from peer');
    await expect(editor).toContainText('from peer');
  } finally {
    await peerContext.close();
  }

  await page.reload();
  await expect(editor).toContainText('Django document content');
  await expect(editor).toContainText('from peer');
  await page.goto('/');
  await expect(page.locator(`[data-home-document-ref="${docId}"]`).first()).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await signIn(page, otherAccount);
  await expect(page.locator(`[data-home-document-ref="${docId}"]`)).toHaveCount(0);
  const session = await page.request.get('/api/config');
  const { csrfToken } = await session.json() as { csrfToken: string };
  const denied = await page.request.post(`/api/documents/${docId}/sync-tokens`, {
    headers: { 'X-CSRFToken': csrfToken }, data: {},
  });
  expect(denied.status()).toBe(403);
});
