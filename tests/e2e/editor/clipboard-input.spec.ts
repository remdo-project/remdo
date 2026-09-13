import { expect, test } from '#editor/fixtures';
import { ensureReady } from '#editor/bridge';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { captureEditorSnapshot } from '#editor/state';

test('rich paste preserves content, hierarchy, focus and undo on a narrow viewport', async ({ page, editor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.load('tree');
  // Reload so the fixture load is outside the paste's undo history.
  await page.reload();
  await ensureReady(page);
  await setCaretAtText(page, 'note2', 2);
  const before = await editor.getEditorState();

  await editorLocator(page).locator('.editor-input').evaluate(element => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>Before</p><ul><li><code>Alpha<br>Beta</code><ul><li>Child</li></ul></li></ul><p><a href="https://example.com">After</a></p>');
    data.setData('text/plain', 'Before\nAlpha\nBeta\nChild\nAfter');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });

  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note2', text: 'no' },
    { noteId: null, text: 'Before' },
    { noteId: null, text: 'Alpha Beta', children: [{ noteId: null, text: 'Child' }] },
    { noteId: null, text: 'After' },
    { noteId: null, text: 'te2', children: [{ noteId: 'note3', text: 'note3' }] },
  ]);
  await expect(editorLocator(page).getByRole('link', { name: 'After' })).toHaveAttribute('href', 'https://example.com');
  await expect(editorLocator(page).locator('code')).toHaveText('Alpha Beta');
  expect((await captureEditorSnapshot(page)).selection).toMatchObject({
    anchorText: 'After', anchorOffset: 5, isCollapsed: true,
  });

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => editor.getEditorState()).toEqual(before);
});
