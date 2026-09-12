import { expect, test } from '#editor/fixtures';
import { ensureReady } from '#editor/bridge';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { captureEditorSnapshot } from '#editor/state';

test('multiline HTML paste preserves destination structure, focus, and undo on a narrow viewport', async ({ page, editor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.load('tree');
  // Reopen the seeded document so its load is outside the paste's undo history.
  await page.reload();
  await ensureReady(page);
  await setCaretAtText(page, 'note2', 2);
  const before = await editor.getEditorState();

  await editorLocator(page).locator('.editor-input').evaluate(element => {
    const data = new DataTransfer();
    data.setData('text/html', '<ul><li><b>Alpha</b><br>Beta<ul><li>Child</li></ul></li><li><a href="https://example.com">Gamma</a></li></ul>');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });

  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note2', text: 'no' },
    { noteId: null, text: 'Alpha' },
    { noteId: null, text: 'Beta' },
    { noteId: null, text: 'Child' },
    { noteId: null, text: 'Gamma' },
    { noteId: null, text: 'te2', children: [{ noteId: 'note3', text: 'note3' }] },
  ]);
  await expect(editorLocator(page).getByRole('link', { name: 'Gamma' })).toHaveCount(0);
  expect((await captureEditorSnapshot(page)).selection).toMatchObject({
    anchorText: 'Gamma', anchorOffset: 5, isCollapsed: true,
  });

  await page.keyboard.press('Control+z');
  await expect.poll(() => editor.getEditorState()).toEqual(before);
});
