import { expect, test } from '#editor/fixtures';
import { createUserDocument } from '../_support/documents';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

// The dev toolbar (dev/test only) surfaces a Playground link pointing at the
// stable /playground/ URL. The link's href is asserted rather than followed:
// public/playground/index.html is unversioned scratch that need not exist, so
// following it can legitimately 404. See docs/dev/dev-tooling.md.
test.describe('Playground link in the dev toolbar', () => {
  test('renders a Playground link to the stable /playground/ URL', async ({ page }) => {
    const document = await createUserDocument(page, `Playground Link ${Date.now()}`);
    await page.goto(createEditorDocumentPath(document.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    const playgroundLink = page.getByRole('link', { name: 'Playground' });
    await expect(playgroundLink).toBeVisible();
    await expect(playgroundLink).toHaveAttribute('href', /\/playground\/$/u);
  });
});
