import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

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

  test('loads flat fixture and shows expected notes', async ({ editor, page }) => {
    await editor.load('flat');

    await expect(editorLocator(page).locator('li.list-item')).toHaveCount(3);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});
