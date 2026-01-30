import type { Locator } from '#editor/fixtures';
import { expect, readOutline, test } from '#editor/fixtures';
import { editorLocator, selectInlineRange, setCaretAtNoteTextNode, setCaretAtText } from '#editor/locators';

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
    await setCaretAtText(page, 'note1');

    const input = editorLocator(page).locator('.editor-input').first();

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await expect(input).toHaveClass(/editor-input--cut-marker/);

    await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
    const pasteCombo = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
    await page.keyboard.press(pasteCombo);

    await expect(editor).toMatchOutline([
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note1', text: 'note1' },
    ]);
    await expect(input).not.toHaveClass(/editor-input--cut-marker/);
    await expect(input).not.toHaveClass(/editor-input--structural/);
  });

  test('keeps the cut marker when pasting inside the marked subtree', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    const input = editorLocator(page).locator('.editor-input').first();

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await expect(input).toHaveClass(/editor-input--cut-marker/);

    const expectedOutline = await readOutline(editor);

    const pasteCombo = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
    await page.keyboard.press(pasteCombo);

    await expect(editor).toMatchOutline(expectedOutline);
    await expect(input).toHaveClass(/editor-input--cut-marker/);
  });

  test('clears the cut marker after pasting a non-cut payload', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    const input = editorLocator(page).locator('.editor-input').first();

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await expect(input).toHaveClass(/editor-input--cut-marker/);

    await setCaretAtText(page, 'note3');
    await input.evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'paste');
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
    });

    await expect(input).not.toHaveClass(/editor-input--cut-marker/);
  });

  test('clears the cut marker after pasting moved notes', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    const input = editorLocator(page).locator('.editor-input').first();

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await expect(input).toHaveClass(/editor-input--cut-marker/);

    await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
    const pasteCombo = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
    await page.keyboard.press(pasteCombo);

    await expect(input).not.toHaveClass(/editor-input--cut-marker/);
  });
});

test.describe('clipboard (caret paste placement)', () => {
  test('pastes multi-line plain text as first children when caret is at end of a note with children', async ({ page, editor }) => {
    await editor.load('tree');
    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);

    await pastePlainText(page, 'A\nB');
    await page.keyboard.type('Z');

    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'note2',
        children: [
          { noteId: null, text: 'A' },
          { noteId: null, text: 'BZ' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);
  });

  test('pastes multi-line plain text in the middle of a formatted note', async ({ page, editor }) => {
    await editor.load('formatted');
    await setCaretAtNoteTextNode(page, 'plain bold italic underline plain', 2, 2);

    await pastePlainText(page, 'A\nB');
    await page.keyboard.type('Z');

    await expect(editor).toMatchOutline([
      {
        noteId: 'bold',
        text: 'bold',
        children: [
          {
            noteId: 'italic',
            text: 'italic',
            children: [{ noteId: 'target', text: 'target' }],
          },
        ],
      },
      { noteId: 'underline', text: 'underline' },
      { noteId: null, text: 'plain bold it' },
      { noteId: null, text: 'A' },
      { noteId: null, text: 'BZ' },
      { noteId: 'mixed-formatting', text: 'alic underline plain' },
    ]);
  });

  test('treats multi-line plain text as multi-note paste for inline selections', async ({ page, editor }) => {
    await editor.load('flat');
    await selectInlineRange(page, 'note2', 1, 4);

    await pastePlainText(page, 'A\nB');

    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'nA2', children: [{ noteId: null, text: 'B' }] },
      { noteId: 'note3', text: 'note3' },
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

async function pastePlainText(page: Parameters<typeof editorLocator>[0], text: string) {
  const input = editorLocator(page).locator('.editor-input').first();
  await input.evaluate((element, payload) => {
    const data = new DataTransfer();
    data.setData('text/plain', payload);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }, text);
}
