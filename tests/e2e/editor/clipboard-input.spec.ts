import { expect, test } from '#editor/fixtures';
import { ensureReady } from '#editor/bridge';
import { editorLocator, setCaretAtNoteTextNode, setCaretAtText } from '#editor/locators';
import { captureEditorSnapshot } from '#editor/state';

test('native inline copy replaces then inserts at the caret, including trailing whitespace', async ({ page, editor }) => {
  const events = await page.evaluateHandle(() => {
    const events: { trusted: boolean; plain: string; html: string; lexical: string }[] = [];
    document.addEventListener('paste', (event) => {
      events.push({
        trusted: event.isTrusted,
        plain: event.clipboardData!.getData('text/plain'),
        html: event.clipboardData!.getData('text/html'),
        lexical: event.clipboardData!.getData('application/x-lexical-editor'),
      });
    }, true);
    return events;
  });

  for (const [text, end, repeated] of [
    ['Alpha', 5, 'AlphaAlpha'],
    ['Alpha ', 6, 'Alpha Alpha '],
    ['Alpha beta', 5, 'AlphaAlpha beta'],
  ] as const) {
    await editor.load('flat');
    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type(text);
    await setCaretAtText(page, text, end);
    await page.keyboard.press('Shift+Home');
    await expect.poll(() => page.evaluate(() => ({
      text: document.getSelection()!.toString(),
      kind: globalThis.__remdoTestBridges!.list()[0]!.editor.selection.get()?.kind,
    }))).toEqual({ text: text.slice(0, end), kind: 'inline' });

    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect((await captureEditorSnapshot(page)).selection).toMatchObject({
      anchorOffset: end, focusOffset: end, isCollapsed: true,
    });
    await page.keyboard.press('ControlOrMeta+v');
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: repeated },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect((await captureEditorSnapshot(page)).selection).toMatchObject({
      anchorOffset: end * 2, focusOffset: end * 2, isCollapsed: true,
    });
    const copied = (await events.jsonValue()).slice(-2);
    expect(copied.map(event => [event.trusted, event.plain])).toEqual([
      [true, text.slice(0, end)], [true, text.slice(0, end)],
    ]);
    for (const event of copied) {
      expect(event.lexical).not.toBe('');
      expect(event.html).not.toMatch(/<(?:ol|ul|li)\b/);
    }
  }
  await events.dispose();
});

test('native full-label copy preserves mixed inline formatting through repeated paste', async ({ page, editor }) => {
  await editor.load('formatted');
  const label = 'plain bold italic underline plain';
  await setCaretAtNoteTextNode(page, label, 4, 6);
  await page.keyboard.press('Shift+Home');
  await expect.poll(() => page.evaluate(() => ({
    text: document.getSelection()!.toString(),
    kind: globalThis.__remdoTestBridges!.list()[0]!.editor.selection.get()?.kind,
  }))).toEqual({ text: label, kind: 'inline' });
  await page.keyboard.press('ControlOrMeta+c');
  for (const repetitions of [1, 2]) {
    await page.keyboard.press('ControlOrMeta+v');
    const row = editorLocator(page).locator('li.list-item:not(.list-nested-item)').last();
    await expect(row).toHaveText(label.repeat(repetitions));
    for (const [selector, text] of [['strong', 'bold '], ['em', 'italic '], ['.text-underline', 'underline']] as const) {
      await expect(row.locator(selector)).toHaveText(Array.from<string>({ length: repetitions }).fill(text));
    }
    expect((await captureEditorSnapshot(page)).selection).toMatchObject({ isCollapsed: true });
  }
});

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
