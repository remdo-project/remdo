import { expectCollaborationDenied } from '../_support/documents';
import { expect, test, withPageGuards } from '#e2e/fixtures';
import { createAuthenticatedContext } from '../_support/auth-context';
import { ensureReady, waitForSynced } from '../editor/_support/bridge';
import { createTestAuthAccount } from '#tests-common/auth-account';

test('owner shares the starter with a local account; recipient edits and unrelated account is denied', async ({ page, browser, contextOptions }, testInfo) => {
  test.slow();
  const recipient = createTestAuthAccount();
  const peerContext = await createAuthenticatedContext(browser, contextOptions, recipient);
  const strangerContext = await createAuthenticatedContext(browser, contextOptions);
  try {
    await page.goto('/');
    await page.getByRole('group', { name: 'Current Server', exact: true })
      .getByRole('button', { name: 'New Document', exact: true }).click();
    await expect(page).toHaveURL(/\/n\/[A-Za-z0-9]+$/u);
    const document = { id: new URL(page.url()).pathname.slice(3) };
    const editor = page.locator('.editor-input');
    await ensureReady(page);
    await expect(editor).toBeEditable();
    await editor.click();
    await page.keyboard.type('Owner content');
    await waitForSynced(page);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sharing', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sharing', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('combobox', { name: 'Document', exact: true }).click();
    await page.getByRole('option', { name: 'New Document', exact: true }).click();
    await page.getByLabel('User email').fill(recipient.email);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('Document shared.', { exact: true })).toBeVisible();
    await expect(page.getByText(recipient.email, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('combobox', { name: 'Document', exact: true }).click();
    await page.getByRole('option', { name: 'New Document', exact: true }).click();
    await expect(page.getByText(recipient.email, { exact: true })).toBeVisible();

    const peer = await peerContext.newPage();
    await withPageGuards(peer, async () => {
      await peer.goto('/');
      await peer.getByRole('group', { name: 'Current Server', exact: true })
        .locator(`[data-home-document-ref="${document.id}"]`).click();
      const peerEditor = peer.locator('.editor-input');
      await ensureReady(peer);
      await expect(peerEditor).toContainText('Owner content');
      await expect(peerEditor).toBeEditable();
      await peerEditor.click();
      await peer.keyboard.press('ControlOrMeta+End');
      await peer.keyboard.type(' and recipient content');
      await waitForSynced(peer);
      await page.goto(`/n/${document.id}`);
      await expect(editor).toContainText('Owner content and recipient content');
      await peer.reload();
      await ensureReady(peer);
      await expect(peerEditor).toContainText('Owner content and recipient content');
      const listing = await peer.request.get('/api/documents');
      expect(await listing.json()).toContainEqual(expect.objectContaining({ id: document.id, shareable: false }));
    }, testInfo);

    const response = await strangerContext.request.get('/api/documents');
    // Without the status check an error response satisfies the absence assertion.
    expect(response.status()).toBe(200);
    expect(await response.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: document.id })]));
    const stranger = await strangerContext.newPage();
    await withPageGuards(stranger, async () => {
      await stranger.goto('/');
      await expectCollaborationDenied(stranger, document.id);
    }, testInfo);
  } finally {
    await peerContext.close();
    await strangerContext.close();
  }
});
