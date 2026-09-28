import { createUserDocument } from '../_support/documents';
import { expect, test, withPageGuards } from '#e2e/fixtures';
import { createAuthenticatedContext } from '../_support/auth-context';
import { createTestAuthAccount } from '#tests-common/auth-account';

function listedDocument(page: import('#e2e/fixtures').Page, documentId: string) {
  return page.getByRole('group', { name: 'Current Server', exact: true })
    .locator(`[data-home-document-ref="${documentId}"]`);
}

test('Home lists documents created and shared by other sources without reloading', async ({ page, browser, contextOptions }, testInfo) => {
  const recipient = createTestAuthAccount();
  const recipientContext = await createAuthenticatedContext(browser, contextOptions, recipient);
  try {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Current Server', exact: true })).toBeVisible();
    const created = await createUserDocument(page, 'Created by another client');
    await expect(listedDocument(page, created.id)).toContainText('Created by another client');

    const recipientPage = await recipientContext.newPage();
    await withPageGuards(recipientPage, async () => {
      await recipientPage.goto('/');
      await expect(recipientPage.getByRole('group', { name: 'Current Server', exact: true })).toBeVisible();
      await expect(listedDocument(recipientPage, created.id)).toHaveCount(0);
      const config = await page.request.get('/api/config');
      const { csrfToken } = await config.json() as { csrfToken: string };
      const shared = await page.request.post(`/api/documents/${created.id}/access`, {
        headers: { 'X-CSRFToken': csrfToken, Origin: new URL(config.url()).origin },
        data: { email: recipient.email },
      });
      expect(shared.ok()).toBe(true);
      await expect(listedDocument(recipientPage, created.id)).toContainText('Created by another client');
    }, testInfo);
  } finally {
    await recipientContext.close();
  }
});
