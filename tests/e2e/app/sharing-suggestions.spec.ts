import { expect, test } from '#e2e/fixtures';
import type { UserDocument } from '#domain/documents/user-data';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { createAuthenticatedContext } from '../_support/auth-context';
import { createUserDocument, shareUserDocument } from '../_support/documents';
import { ensureReady } from '../editor/_support/bridge';

test('suggests direct sharing contacts in both directions without granting access on selection', async ({ page, browser, contextOptions }) => {
  const outgoing = { ...createTestAuthAccount(), name: 'Zoe Recipient' };
  const incoming = { ...createTestAuthAccount(), name: 'Ada Sender' };
  const outgoingContext = await createAuthenticatedContext(browser, contextOptions, outgoing);
  const incomingContext = await createAuthenticatedContext(browser, contextOptions, incoming);
  try {
    const outgoingPage = await outgoingContext.newPage();
    const incomingPage = await incomingContext.newPage();
    const session = await page.request.get('/api/auth/browser/v1/auth/session');
    const { data: { user: { email: ownEmail } } } = await session.json() as { data: { user: { email: string } } };
    const target = await createUserDocument(page, 'Sharing suggestions');
    const previous = await createUserDocument(page, 'Previous share');
    const duplicate = await createUserDocument(page, 'Another previous share');
    await shareUserDocument(page, previous.id, outgoing.email);
    await shareUserDocument(page, duplicate.id, outgoing.email);
    const mutual = await createUserDocument(outgoingPage, 'Mutual connection');
    await shareUserDocument(outgoingPage, mutual.id, ownEmail);
    const received = await createUserDocument(incomingPage, 'Incoming connection');
    await shareUserDocument(incomingPage, received.id, ownEmail);

    await page.goto(`/n/${target.id}`);
    await ensureReady(page);
    await page.getByRole('button', { name: /^Share document —/u }).click();
    const dialog = page.getByRole('dialog', { name: 'Share “Sharing suggestions”', exact: true });
    const field = dialog.getByRole('combobox', { name: 'Add a person by email', exact: true });
    const list = page.getByRole('listbox', { name: 'People from sharing', exact: true });
    await field.fill('example');
    await expect(list.getByRole('option')).toHaveText([
      `${outgoing.name}${outgoing.email}`,
      `${incoming.name}${incoming.email}`,
    ]);
    await field.fill('Zoe');
    await expect(list.getByRole('option')).toHaveCount(1);
    await field.press('ArrowDown');
    await field.press('Enter');
    await expect(field).toHaveValue(outgoing.email);
    await expect(field).toHaveAccessibleDescription(/Valid email format/u);
    await expect(list).toHaveCount(0);
    await expect(dialog.getByText('Only you have access.', { exact: true })).toBeVisible();

    // Selecting the same option again must keep the email as the committed value.
    await field.press('ArrowDown');
    await list.getByRole('option', { name: `${outgoing.name}, ${outgoing.email}`, exact: true }).click();
    await expect(field).toHaveValue(outgoing.email);
    await expect(field).toHaveAccessibleDescription(/Valid email format/u);
    await expect(dialog.getByText('Only you have access.', { exact: true })).toBeVisible();

    await field.fill(incoming.email);
    await expect(field).toHaveAccessibleDescription(/Valid email format/u);
    await list.getByRole('option', { name: `${incoming.name}, ${incoming.email}`, exact: true }).click();
    await expect(field).toHaveValue(incoming.email);
    await expect(field).toHaveAccessibleDescription(/Valid email format/u);

    await field.fill('example');
    await expect(list).toBeVisible();
    await field.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(field).toHaveValue('example');

    await page.setViewportSize({ width: 390, height: 844 });
    await field.fill(incoming.name);
    await expect(list.getByRole('option')).toHaveCount(1);
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await list.getByRole('option', { name: `${incoming.name}, ${incoming.email}`, exact: true }).click();
    await expect(field).toHaveValue(incoming.email);
    await expect(dialog.getByText('Only you have access.', { exact: true })).toBeVisible();
    const before = await page.request.get('/api/documents');
    expect((await before.json() as UserDocument[]).find((document) => document.id === target.id)!.access).toEqual([]);
    let acceptRequest!: (continueRequest: () => Promise<void>) => void;
    const grantRequest = new Promise<() => Promise<void>>(resolve => { acceptRequest = resolve; });
    const sharePath = `**/api/documents/${target.id}/access`;
    await page.route(sharePath, route => acceptRequest(() => route.continue()));
    await dialog.getByRole('button', { name: 'Add access', exact: true }).click();
    const continueGrant = await grantRequest;
    await expect(field).toBeDisabled();
    await dialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
    await expect(dialog).toHaveCount(0);
    await continueGrant();
    await page.unroute(sharePath);

    const shareButton = page.getByRole('button', { name: 'Share document — Shared by you · 2 people have access', exact: true });
    await expect(shareButton).toBeVisible();
    await expect.poll(() => shareButton.locator('svg path').first().evaluate(node => getComputedStyle(node).fill)).not.toBe('none');
    await shareButton.click();
    await expect(dialog.getByText(incoming.email, { exact: true })).toBeVisible();
    await field.fill('example');
    await expect(list.getByRole('option')).toHaveText([`${outgoing.name}${outgoing.email}`]);

    await field.fill('someone-new@example.test');
    await expect(list).toHaveCount(0);
    await field.press('Tab');
    await expect(field).toHaveValue('someone-new@example.test');
    await dialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/u }).click();
    await page.getByRole('button', { name: /^Share document —/u }).click();
    await expect(field).toHaveValue('');
  } finally {
    await incomingContext.close();
    await outgoingContext.close();
  }
});
