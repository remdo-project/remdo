import { expect, test, withPageGuards } from '#e2e/fixtures';
import { createAuthenticatedContext } from '../_support/auth-context';
import { createUserDocument } from '../_support/documents';
import { createTestAuthAccount } from '#tests-common/auth-account';

test('owner shares with a local account; recipient edits and unrelated account is denied', async ({ page, browser, contextOptions }, testInfo) => {
  test.slow();
  const recipient = createTestAuthAccount();
  const peerContext = await createAuthenticatedContext(browser, contextOptions, recipient);
  const strangerContext = await createAuthenticatedContext(browser, contextOptions);
  try {
    const document = await createUserDocument(page, 'Shared research');
    await page.goto(`/n/${document.id}`);
    const editor = page.locator('.editor-input');
    await expect(editor).toBeEditable();
    await editor.click();
    await page.keyboard.type('Owner content');
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sharing', exact: true }).click();
    await page.getByRole('combobox', { name: 'Document', exact: true }).click();
    await page.getByRole('option', { name: 'Shared research', exact: true }).click();
    await page.getByLabel('User email').fill(recipient.email);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('Document shared.', { exact: true })).toBeVisible();
    await expect(page.getByText(recipient.email, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('combobox', { name: 'Document', exact: true }).click();
    await page.getByRole('option', { name: 'Shared research', exact: true }).click();
    await expect(page.getByText(recipient.email, { exact: true })).toBeVisible();

    const peer = await peerContext.newPage();
    await withPageGuards(peer, async () => {
      await peer.goto('/');
      await peer.getByRole('group', { name: 'Current Server', exact: true })
        .getByRole('button', { name: 'Shared research', exact: true }).click();
      const peerEditor = peer.locator('.editor-input');
      await expect(peerEditor).toContainText('Owner content');
      await expect(peerEditor).toBeEditable();
      await peerEditor.click();
      await peer.keyboard.press('ControlOrMeta+End');
      await peer.keyboard.type(' and recipient content');
      await page.goto(`/n/${document.id}`);
      await expect(editor).toContainText('Owner content and recipient content');
      await peer.goto('/sharing');
      await peer.getByRole('combobox', { name: 'Document', exact: true }).click();
      await expect(peer.getByRole('option', { name: 'Shared research', exact: true })).toHaveCount(0);
    }, testInfo);

    const response = await strangerContext.request.get('/api/documents');
    expect(await response.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: document.id })]));
    const config = await strangerContext.request.get('/api/config');
    const { csrfToken } = await config.json() as { csrfToken: string };
    const denied = await strangerContext.request.post(`/api/documents/${document.id}/sync-tokens`, {
      headers: { 'X-CSRFToken': csrfToken }, data: {},
    });
    expect(denied.status()).toBe(403);
  } finally {
    await peerContext.close();
    await strangerContext.close();
  }
});
