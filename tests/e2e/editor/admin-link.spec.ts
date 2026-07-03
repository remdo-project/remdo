import { expect, test } from '#editor/fixtures';
import { createUserDocument } from '../_support/documents';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

// The default e2e session is enrolled via /api/admin/enroll, so it holds the
// admin role — the document header should surface the Admin link for it.
test.describe('Admin link in the document header', () => {
  test('an admin sees the Admin link and it opens the admin panel', async ({ page }) => {
    const document = await createUserDocument(page, `Admin Link ${Date.now()}`);
    await page.goto(createEditorDocumentPath(document.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    const adminLink = page.getByRole('link', { name: 'Admin' });
    await expect(adminLink).toBeVisible();

    await adminLink.click();
    await expect(page).toHaveURL(/\/admin$/u);
    await expect(page.getByRole('heading', { name: 'Source servers' })).toBeVisible();
  });
});
