import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

test.describe('selection (structural highlight)', () => {
  test('toggles the structural highlight class', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1');

    const input = editorLocator(page).locator('.editor-input');
    await expect(input).not.toHaveClass(/editor-input--structural/);

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    await expect(input).toHaveClass(/editor-input--structural/);

    await page.keyboard.press('Escape');

    await expect(input).not.toHaveClass(/editor-input--structural/);
  });
});
