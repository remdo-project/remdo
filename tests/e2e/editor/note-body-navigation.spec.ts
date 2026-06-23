import { expect, test } from '#editor/fixtures';
import { setCaretAtText } from '#editor/locators';
import { captureEditorSnapshot } from '#editor/state';

// Vertical arrow navigation is transparent to a note body (see
// docs/outliner/body.md): it lands where it would if the body were not there,
// and never stops in a body. These run in a real browser because native caret
// movement (the thing under test) is not emulated by the unit-test environment.

async function addBody(page: Parameters<typeof setCaretAtText>[0], noteLabel: string, bodyText: string) {
  await setCaretAtText(page, noteLabel, Number.POSITIVE_INFINITY);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type(bodyText);
}

/** True when the collapsed caret currently sits inside a note body. */
async function caretInBody(page: Parameters<typeof setCaretAtText>[0]): Promise<boolean> {
  return page.evaluate(() => {
    const node = globalThis.getSelection()?.anchorNode ?? null;
    const el = node instanceof Element ? node : node?.parentElement ?? null;
    return Boolean(el?.closest('.note-body'));
  });
}

test.describe('note body vertical navigation (docs/outliner/body.md)', () => {
  test('ArrowDown from a note with a body skips it to the next note', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('ArrowDown');

    expect(await caretInBody(page)).toBe(false);
    expect((await captureEditorSnapshot(page)).selection?.anchorText).toBe('note2');
  });

  test('ArrowDown from a note with a body and children lands on the first child', async ({ page, editor }) => {
    // tree: note1; note2 > note3. Body on note2 (which has child note3).
    await editor.load('tree');
    await addBody(page, 'note2', 'thebody');

    await setCaretAtText(page, 'note2', 0);
    await page.keyboard.press('ArrowDown');

    expect(await caretInBody(page)).toBe(false);
    expect((await captureEditorSnapshot(page)).selection?.anchorText).toBe('note3');
  });

  test('ArrowUp into a nested body reaches the body owner, not the body', async ({ page, editor }) => {
    // tree-complex: note2 > note3 (leaf); note4 is note2's sibling. A body on
    // note3 renders just above note4, so ArrowUp from note4 must reach note3.
    await editor.load('tree-complex');
    await addBody(page, 'note3', 'thebody');

    await setCaretAtText(page, 'note4', 0);
    await page.keyboard.press('ArrowUp');

    expect(await caretInBody(page)).toBe(false);
    expect((await captureEditorSnapshot(page)).selection?.anchorText).toBe('note3');
  });

  test('arrows leave a body freely once the caret is inside it', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    // Caret is inside the body after typing; ArrowDown leaves it to note2.
    await setCaretAtText(page, 'thebody', Number.POSITIVE_INFINITY);
    await page.keyboard.press('ArrowDown');

    expect(await caretInBody(page)).toBe(false);
    expect((await captureEditorSnapshot(page)).selection?.anchorText).toBe('note2');
  });

  test('ArrowRight at the end of a note with a body skips the body to the next note', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.press('ArrowRight');

    expect(await caretInBody(page)).toBe(false);
    expect((await captureEditorSnapshot(page)).selection?.anchorText).toBe('note2');
  });

  test('ArrowLeft at the start of the note after a body skips the body to its owner', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    // note2 sits after note1's body; ArrowLeft at note2's start reaches note1.
    await setCaretAtText(page, 'note2', 0);
    await page.keyboard.press('ArrowLeft');

    expect(await caretInBody(page)).toBe(false);
    expect((await captureEditorSnapshot(page)).selection?.anchorText).toBe('note1');
  });
});

/** True when the selection focus (the moving end) sits inside a note body. */
async function focusInBody(page: Parameters<typeof setCaretAtText>[0]): Promise<boolean> {
  return page.evaluate(() => {
    const node = globalThis.getSelection()?.focusNode ?? null;
    const el = node instanceof Element ? node : node?.parentElement ?? null;
    return Boolean(el?.closest('.note-body'));
  });
}

test.describe('note body shift-arrow selection boundary (docs/outliner/body.md)', () => {
  test('Shift+ArrowLeft at the body start does not extend the selection out of the body', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    await setCaretAtText(page, 'thebody', 0);
    await page.keyboard.press('Shift+ArrowLeft');

    expect(await focusInBody(page)).toBe(true);
  });

  test('Shift+ArrowRight at the body end does not extend the selection out of the body', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    await setCaretAtText(page, 'thebody', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Shift+ArrowRight');

    expect(await focusInBody(page)).toBe(true);
  });

  test('Shift+ArrowRight within the body still extends the selection', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    await setCaretAtText(page, 'thebody', 0);
    await page.keyboard.press('Shift+ArrowRight');

    expect(await focusInBody(page)).toBe(true);
    const selectedLength = await page.evaluate(() => globalThis.getSelection()?.toString().length ?? 0);
    expect(selectedLength).toBe(1);
  });

  test('Shift+ArrowDown from mid-text in a single-line body does not extend out', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'thebody');

    // Caret mid-text (not at the trailing edge); a single-line body has no line
    // below, so Shift+ArrowDown must not extend the focus into the next note.
    await setCaretAtText(page, 'thebody', 3);
    await page.keyboard.press('Shift+ArrowDown');

    expect(await focusInBody(page)).toBe(true);
  });

  test('Shift+ArrowUp from mid-text in a single-line body does not extend out', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note2', 'thebody');

    await setCaretAtText(page, 'thebody', 3);
    await page.keyboard.press('Shift+ArrowUp');

    expect(await focusInBody(page)).toBe(true);
  });

  test('Shift+ArrowDown from the last line of a multi-line body does not extend out', async ({ page, editor }) => {
    await editor.load('flat');
    // Two-line body: 'one\ntwo'. The caret sits mid-text on the last line; with
    // no line below inside the body, Shift+ArrowDown must not escape to note2.
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');

    await setCaretAtText(page, 'two', 1);
    await page.keyboard.press('Shift+ArrowDown');

    expect(await focusInBody(page)).toBe(true);
  });
});
