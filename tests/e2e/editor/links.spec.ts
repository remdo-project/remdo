import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

test.describe('note links', () => {
  test('inserts a note link from @ picker with Enter', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note2');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toContainText('note2');

    await page.keyboard.press('Enter');

    await expect(picker).toHaveCount(0);
    await expect(editorLocator(page).getByRole('link', { name: 'note2' })).toHaveCount(1);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('clicking a note link navigates to zoom target', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note2');
    await page.keyboard.press('Enter');

    const link = editorLocator(page).getByRole('link', { name: 'note2' });
    await expect(link).toHaveCount(1);

    await link.click();

    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note2$`));
  });
});
