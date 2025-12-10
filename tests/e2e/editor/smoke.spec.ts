import { expect, test } from './_support/fixtures';

test.describe('Editor (focused) visibility', () => {
  test('shows editor content only', async ({ page, editor }) => {
    await editor.load('flat');

    const editorContainer = page.locator('.editor-container');
    await expect(editorContainer).toBeVisible();

    const input = page.locator('.editor-input');
    await expect(input).toBeVisible();
    await expect(page.locator('li.list-item')).toHaveCount(3);

    // App chrome should be hidden by the focus style.
    await expect(page.getByRole('heading', { name: 'RemDo' })).toBeHidden();
  });
});
