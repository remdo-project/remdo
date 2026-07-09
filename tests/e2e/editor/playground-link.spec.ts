import { expect, test } from '#editor/fixtures';
import { createUserDocument } from '../_support/documents';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

// The Playground item reaches the live app header only through the dev-only
// DevToolbarSeam (lazy, import.meta.env.DEV) — this asserts it renders there in
// a running authenticated shell. The href value is covered by the unit test
// (dev-toolbar-links.spec.tsx); it is not re-asserted or followed here, since
// public/playground/index.html is unversioned scratch that can legitimately
// 404. See docs/dev/dev-tooling.md.
test.describe('Playground link in the dev toolbar', () => {
  test('renders the Playground link in the live app header', async ({ page }) => {
    const document = await createUserDocument(page, `Playground Link ${Date.now()}`);
    await page.goto(createEditorDocumentPath(document.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    await expect(page.getByRole('link', { name: 'Playground' })).toBeVisible();
  });
});
