import { expect, test } from '#editor/fixtures';
import { editorLocator } from './_support/locators';

test.describe('Editor (focused) visibility', () => {
  test('shows editor content only', async ({ page, editor }) => {
    await editor.load('flat');

    const editorContainer = editorLocator(page);
    await expect(editorContainer).toBeVisible();

    const input = editorLocator(page).locator('.editor-input');
    await expect(input).toBeVisible();
    await expect(editorLocator(page).locator('li.list-item')).toHaveCount(3);

    // App chrome should be hidden by the focus style.
    await expect(page.getByRole('heading', { name: 'RemDo' })).toBeHidden();
  });
});
