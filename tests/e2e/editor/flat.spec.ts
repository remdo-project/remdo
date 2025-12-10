import { expect, test } from '#editor/fixtures';
import { editorLocator } from './_support/locators';

test.describe('Editor fixtures', () => {
  test('loads flat fixture and shows expected notes', async ({ editor, page }) => {
    await editor.load('flat');

    const items = editorLocator(page).locator('li.list-item >> span');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('note1');
    await expect(items.nth(1)).toHaveText('note2');
    await expect(items.nth(2)).toHaveText('note3');
  });
});
