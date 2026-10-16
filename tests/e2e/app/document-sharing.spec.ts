import { expectCollaborationDenied } from '../_support/documents';
import { expect, test, withPageGuards } from '#e2e/fixtures';
import { createAuthenticatedContext } from '../_support/auth-context';
import { ensureReady, waitForSynced } from '../editor/_support/bridge';
import { openNoteMenu } from '../editor/_support/menu';
import { createTestAuthAccount } from '#tests-common/auth-account';

test('places the shared-documents bell and keeps normal link spacing on sign-out', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: 'Shared with you', exact: true })).toBeVisible();
  // Lazy development links can move the header between separate measurements.
  const [aboutBounds, bellBounds, logoutBounds] = await header.evaluate(element =>
    ['.site-about', '.shared-documents-button', 'a[href="/sign-out"]'].map(selector => {
      const { left, right } = element.querySelector(selector)!.getBoundingClientRect();
      return { left, right };
    }));
  expect(aboutBounds!.right).toBeLessThanOrEqual(bellBounds!.left);
  expect(bellBounds!.right).toBeLessThanOrEqual(logoutBounds!.left);
  const headerGap = bellBounds!.left - aboutBounds!.right;

  await page.goto('/sign-out');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Shared with you', exact: true })).toHaveCount(0);
  const [signOutAboutBounds, signOutLogoutBounds] = await header.evaluate(element =>
    ['.site-about', 'a[href="/sign-out"]'].map(selector => {
      const { left, right } = element.querySelector(selector)!.getBoundingClientRect();
      return { left, right };
    }));
  expect(signOutLogoutBounds!.left - signOutAboutBounds!.right).toBeCloseTo(headerGap, 0);
});

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
    const shareButton = page.getByRole('button', { name: /^Share document —/u });
    await expect(shareButton).toHaveAccessibleName('Share document — Private · Only you have access');
    await expect.poll(() => shareButton.locator('svg path').first().evaluate(node => getComputedStyle(node).fill)).toBe('none');
    await expect(page.locator('.location-header')).toHaveText('New Document');

    // The toolbar acts on the whole document even when a note is zoomed.
    const noteMenu = await openNoteMenu(page, 'Owner content');
    await noteMenu.item('zoom').click();
    await expect(page).toHaveURL(new RegExp(`/n/${document.id}_[A-Za-z0-9]+$`, 'u'));
    await expect(page.locator('.location-header')).toHaveCount(0);
    await expect(shareButton).toHaveText('');
    await shareButton.click();
    const toolbarDialog = page.getByRole('dialog', { name: 'Share “New Document”', exact: true });
    const emailField = toolbarDialog.getByRole('combobox', { name: 'Add a person by email', exact: true });
    const addAccess = toolbarDialog.getByRole('button', { name: 'Add access', exact: true });
    const addAccessBackground = () => addAccess.evaluate(node => getComputedStyle(node).backgroundColor);
    const initialBackground = await addAccessBackground();
    const closeBackground = await toolbarDialog.getByRole('button', { name: 'Close', exact: true })
      .filter({ hasText: /^Close$/u }).evaluate(node => getComputedStyle(node).backgroundColor);
    expect(initialBackground).not.toBe(closeBackground);
    await expect(toolbarDialog.getByText('Not added yet. Select Add access.')).toHaveCount(0);
    await emailField.fill('sample@example');
    await expect(toolbarDialog.getByRole('alert')).toHaveCount(0);
    await expect(toolbarDialog.locator('.document-share-email svg')).toHaveCount(0);
    await emailField.press('Tab');
    await expect(toolbarDialog.getByRole('alert')).toHaveText('Enter a valid email address.');
    await expect(emailField).toHaveAttribute('aria-invalid', 'true');
    const invalidBorder = await emailField.evaluate(node => getComputedStyle(node).borderColor);
    await emailField.fill(recipient.email);
    await expect(toolbarDialog.getByRole('alert')).toHaveCount(0);
    await expect(emailField).toHaveAccessibleDescription(/Valid email format/u);
    const checkmark = toolbarDialog.locator('.document-share-email svg');
    await expect(checkmark).toBeVisible();
    const validColor = await checkmark.evaluate(node => getComputedStyle(node).stroke);
    await expect(emailField).toHaveCSS('border-color', validColor);
    expect(validColor).not.toBe(invalidBorder);
    await expect(emailField).toHaveCSS('border-top-width', '1px');
    await expect(emailField).toHaveCSS('outline-style', 'none');
    const buttonPosition = await addAccess.boundingBox();
    await emailField.press('Tab');
    await expect(emailField).toHaveAccessibleDescription(/Valid email format/u);
    await expect(emailField).toHaveCSS('border-color', validColor);
    expect((await addAccess.boundingBox())!.y).toBe(buttonPosition!.y);
    await emailField.focus();
    await expect(emailField).toHaveCSS('border-color', validColor);
    await expect(emailField).toHaveCSS('border-top-width', '1px');
    await expect(emailField).toHaveCSS('outline-style', 'none');
    await emailField.fill('not-an-email');
    await addAccess.click();
    await expect(toolbarDialog.getByRole('alert')).toHaveText('Enter a valid email address.');
    await expect(emailField).toBeFocused();
    await expect(toolbarDialog).toBeVisible();
    await emailField.hover();
    await expect.poll(addAccessBackground).toBe(initialBackground);
    await emailField.fill(recipient.email);
    await expect(toolbarDialog.getByRole('alert')).toHaveCount(0);
    await expect(toolbarDialog.getByText('Not added yet. Select Add access.')).toBeVisible();
    await expect.poll(addAccessBackground).toBe(initialBackground);
    await toolbarDialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
    await expect(shareButton).toBeFocused();
    await shareButton.click();
    await expect(emailField).toHaveValue('');
    await expect(toolbarDialog.getByText('Not added yet. Select Add access.')).toHaveCount(0);
    await expect(toolbarDialog.getByText('Only you have access.', { exact: true })).toBeVisible();
    // Clipboard access can fail on a host preview; its fallback must be usable.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('Clipboard unavailable'); } },
      });
    });
    await toolbarDialog.getByRole('button', { name: 'Copy link', exact: true }).click();
    const link = toolbarDialog.getByRole('textbox', { name: 'Document link', exact: true });
    await expect(link).toHaveValue(new URL(`/n/${document.id}`, page.url()).href);
    await expect(link).toBeFocused();
    await toolbarDialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
    await expect(shareButton).toBeFocused();

    await page.goto('/');
    const row = page.getByRole('group', { name: 'Current Server', exact: true })
      .locator(`[data-home-document-ref="${document.id}"]`).locator('..');
    await expect(row.locator('[data-home-document-ref]')).toHaveAccessibleDescription('');
    await row.hover();
    await row.getByRole('button', { name: /^Actions for/u }).click();
    await page.getByRole('menuitem', { name: 'Share…' }).click();
    const shareDialog = page.getByRole('dialog', { name: /Share/u });
    await shareDialog.getByLabel(/Add a person by email/u).fill(recipient.email);
    await shareDialog.getByRole('combobox', { name: 'Add a person by email', exact: true }).press('Enter');
    // The grant appears without reopening the dialog.
    await expect(shareDialog.getByText(recipient.email, { exact: true })).toBeVisible();
    await expect(shareDialog.getByRole('status')).toHaveText(`${recipient.email} has access. They can edit this document. No email was sent.`);
    await shareDialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row.locator('[data-home-document-ref]')).toHaveAccessibleDescription('Shared by you');
    const sharedMarker = row.getByRole('button', { name: /^Shared by you/u });
    await sharedMarker.click();
    await expect(shareDialog.getByText(recipient.email, { exact: true })).toBeVisible();
    await shareDialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
    await expect(sharedMarker).toBeFocused();

    await page.goto(`/n/${document.id}`);
    await ensureReady(page);
    await expect(shareButton).toHaveAccessibleName('Share document — Shared by you · 2 people have access');
    await expect.poll(() => shareButton.locator('svg path').first().evaluate(node => getComputedStyle(node).fill)).not.toBe('none');
    await expect(page.locator('.location-header')).toHaveText('New Document');

    const peer = await peerContext.newPage();
    await withPageGuards(peer, async () => {
      await peer.goto('/');
      const sharedRow = peer.getByRole('group', { name: 'Current Server', exact: true })
        .locator(`[data-home-document-ref="${document.id}"]`);
      await expect(sharedRow).toHaveAccessibleDescription('Shared with you');
      await peer.getByRole('button', { name: 'Shared with you', exact: true }).click();
      const sharedDocuments = peer.getByRole('dialog', { name: 'Shared with you', exact: true });
      const receivedLink = sharedDocuments.getByRole('link', { name: /New Document/u });
      await expect(receivedLink).toHaveAttribute('href', `/n/${document.id}`);
      await expect(sharedDocuments.getByRole('link')).toHaveCount(1);
      await receivedLink.click();
      await expect(sharedDocuments).toHaveCount(0);
      const peerEditor = peer.locator('.editor-input');
      await ensureReady(peer);
      const peerShareButton = peer.getByRole('button', { name: 'View document access — Shared with you · You can edit', exact: true });
      await expect.poll(() => peerShareButton.locator('svg path').first().evaluate(node => getComputedStyle(node).fill)).not.toBe('none');
      await expect(peer.locator('.location-header')).toHaveText('New Document');
      await peerShareButton.click();
      const ownAccess = peer.getByRole('dialog', { name: 'Share “New Document”', exact: true });
      await expect(ownAccess.getByText('Your access', { exact: true })).toBeVisible();
      await expect(ownAccess.getByRole('combobox', { name: 'Add a person by email', exact: true })).toHaveCount(0);
      await expect(ownAccess.getByText(recipient.email, { exact: true })).toHaveCount(0);
      await ownAccess.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
      await expect(peerEditor).toContainText('Owner content');
      await expect(peerEditor).toBeEditable();
      await peerEditor.click();
      await peer.keyboard.press('ControlOrMeta+End');
      await peer.keyboard.type(' and recipient content');
      await waitForSynced(peer);
      await page.goto(`/n/${document.id}`);
      await expect(shareButton).toHaveAccessibleName('Share document — Shared by you · 2 people have access');
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
