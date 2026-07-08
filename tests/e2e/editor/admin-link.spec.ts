import { expect, test } from '#editor/fixtures';
import { createUserDocument } from '../_support/documents';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

// The default e2e session is enrolled via /api/admin/enroll, so it holds the
// admin role — the top toolbar should surface the Admin link (next to Sharing).
test.describe('Admin link in the top toolbar', () => {
  test('an admin sees the Admin link and it opens the admin panel', async ({ page }) => {
    const document = await createUserDocument(page, `Admin Link ${Date.now()}`);
    await page.goto(createEditorDocumentPath(document.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    const adminLink = page.getByRole('link', { name: 'Admin' });
    await expect(adminLink).toBeVisible();

    await adminLink.click();
    await expect(page).toHaveURL(/\/admin$/u);
    // The admin panel is a placeholder now (source-server controls were removed
    // with the URL-first linking redesign; see docs/access-model.md).
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  });
});
