import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

// A body-wrapper is an li.list-item like any note, so in numbered and check
// lists it must not show a list marker or count as a note (see
// docs/outliner/body.md). These assert the computed marker state in a real
// browser, where the ordered-counter / checkbox rules actually apply.

async function addBody(page: Parameters<typeof setCaretAtText>[0], noteLabel: string, bodyText: string) {
  await setCaretAtText(page, noteLabel, Number.POSITIVE_INFINITY);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type(bodyText);
}

/** The computed pseudo-element `content` for the li that holds the body. */
function bodyWrapperPseudoContent(page: Parameters<typeof setCaretAtText>[0], pseudo: '::before' | '::after') {
  return editorLocator(page)
    .locator('li.list-item:has(> .note-body)')
    .first()
    .evaluate((el, p) => globalThis.getComputedStyle(el, p).content, pseudo);
}

test.describe('note body list markers (docs/outliner/body.md)', () => {
  test('a body in a numbered list shows no number and does not offset the count', async ({ page, editor }) => {
    // tree-list-types: note2 lives in a number list.
    await editor.load('tree-list-types');
    await addBody(page, 'note2', 'thebody');

    // The body-wrapper neither numbers nor increments the ordered counter.
    expect(await bodyWrapperPseudoContent(page, '::before')).toBe('none');
    const wrapperIncrement = await editorLocator(page)
      .locator('li.list-item:has(> .note-body)')
      .first()
      .evaluate((el) => globalThis.getComputedStyle(el).counterIncrement);
    expect(wrapperIncrement).toBe('none');
  });

  test('a body in a check list shows no checkbox', async ({ page, editor }) => {
    // tree-list-types: note4 lives in a check list.
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'thebody');

    expect(await bodyWrapperPseudoContent(page, '::after')).toBe('none');
  });
});
