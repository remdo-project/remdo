import { expect, test } from '#editor/fixtures';
import { editorLocator, noteRow, selectInlineRange, setCaretAtNoteTextNode, setCaretAtText } from '#editor/locators';

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

  test('keeps Cmd/Ctrl+A on an empty note structural after Lexical normalizes the DOM range', async ({ page, editor }) => {
    await editor.load('empty-labels');
    await setCaretAtText(page, 'child-of-empty');
    // Lexical handles a dispatched selectionchange synchronously, unlike a native ArrowDown.
    await noteRow(page, 'child-of-empty').evaluate((row) => {
      const emptyNote = row.nextElementSibling!;
      const range = document.createRange();
      range.setStart(emptyNote, 0);
      range.collapse(true);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const isCaretInEmptyNote = () => page.evaluate(() => {
      const selection = document.getSelection();
      return selection?.isCollapsed === true
        && selection.anchorNode?.nodeName === 'LI'
        && selection.anchorNode.textContent === '';
    });
    await expect.poll(isCaretInEmptyNote).toBe(true);

    const input = editorLocator(page).locator('.editor-input');
    await page.keyboard.press('ControlOrMeta+A');
    await expect(input).toHaveClass(/editor-input--structural/);

    // Lexical then normalizes the empty note's element range back to a caret inside it.
    await expect.poll(isCaretInEmptyNote).toBe(true);
    await expect(input).toHaveClass(/editor-input--structural/);
  });
});

test.describe('clipboard (structural cut)', () => {
  test('removes a note range immediately and pastes it elsewhere', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1');

    const input = editorLocator(page).locator('.editor-input').first();

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const cutCombo = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
    await page.keyboard.press(cutCombo);

    await expect(editor).toMatchOutline([
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
    const pasteCombo = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
    await page.keyboard.press(pasteCombo);

    await expect(editor).toMatchOutline([
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note1', text: 'note1' },
    ]);
    await expect(input).not.toHaveClass(/editor-input--structural/);
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
      { noteId: 'mixedFormatting', text: 'plain bold it' },
      { noteId: null, text: 'A' },
      { noteId: null, text: 'BZ' },
      { noteId: null, text: 'alic underline plain' },
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

async function pastePlainText(page: Parameters<typeof editorLocator>[0], text: string) {
  const input = editorLocator(page).locator('.editor-input').first();
  await input.evaluate((element, payload) => {
    const data = new DataTransfer();
    data.setData('text/plain', payload);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }, text);
}
