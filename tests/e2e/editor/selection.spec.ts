import type { Locator } from '#editor/fixtures';
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

test.describe('selection (cut marker)', () => {
  test('replaces the structural highlight with the cut marker overlay', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    const input = editorLocator(page).locator('.editor-input').first();
    await expect(input).not.toHaveClass(/editor-input--structural/);

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    await expect(input).toHaveClass(/editor-input--structural/);

    const selectionVars = await readOverlayVars(input, '--structural-selection-top', '--structural-selection-height');
    expect(Number.parseFloat(selectionVars.height)).toBeGreaterThan(0);

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await expect(input).not.toHaveClass(/editor-input--structural/);
    await expect(input).toHaveClass(/editor-input--cut-marker/);

    const cutVars = await readOverlayVars(input, '--cut-marker-top', '--cut-marker-height');
    expect(Number.parseFloat(cutVars.height)).toBeGreaterThan(0);
    expect(cutVars.top).toBe(selectionVars.top);
    expect(cutVars.height).toBe(selectionVars.height);
  });

  test('moves a structural selection on cut and paste', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await setCaretAtText(page, 'note3');
    const pasteCombo = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
    await page.keyboard.press(pasteCombo);

    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });
});

async function readOverlayVars(input: Locator, topVar: string, heightVar: string) {
  return input.evaluate(
    (element, vars) => {
      const style = getComputedStyle(element);
      return {
        top: style.getPropertyValue(vars.topVar).trim(),
        height: style.getPropertyValue(vars.heightVar).trim(),
      };
    },
    { topVar, heightVar }
  );
}
