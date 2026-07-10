import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

type EditorPage = Parameters<typeof setCaretAtText>[0];

// A body-wrapper is a dedicated `.note-body-wrapper` <li> (the BodyWrapperNode),
// not a `.list-item`, so list markers (bullet, ordered counter, checkbox) — which
// all target `li.list-item` — never apply to it, and it is never a checkbox in
// the accessibility tree (see docs/outliner/body.md). These assert that computed
// state in a real browser, where the marker rules actually apply.

async function addBody(page: EditorPage, noteLabel: string, bodyText: string) {
  await setCaretAtText(page, noteLabel, Number.POSITIVE_INFINITY);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type(bodyText);
}

function bodyWrapper(page: EditorPage) {
  return editorLocator(page).locator('li.note-body-wrapper').first();
}

/** The computed pseudo-element `content` for the li that holds the body. */
function bodyWrapperPseudoContent(
  page: EditorPage,
  pseudo: '::before' | '::after'
) {
  return bodyWrapper(page).evaluate(
    (el, p) => globalThis.getComputedStyle(el, p).content,
    pseudo
  );
}

async function textLeft(page: EditorPage, label: string): Promise<number> {
  return editorLocator(page)
    .locator('[data-lexical-text="true"]')
    .filter({ hasText: label })
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.firstChild ?? el);
      const { left } = range.getBoundingClientRect();
      return left;
    });
}

async function expectAlignedTextLeft(page: EditorPage, noteLabel: string, bodyText: string) {
  const [noteLeft, bodyLeft] = await Promise.all([
    textLeft(page, noteLabel),
    textLeft(page, bodyText),
  ]);

  expect(Math.abs(noteLeft - bodyLeft)).toBeLessThan(1);
}

async function bodyTextDecorationLine(page: EditorPage, bodyText: string): Promise<string> {
  return editorLocator(page)
    .locator('.note-body')
    .filter({ hasText: bodyText })
    .first()
    .evaluate((el) => globalThis.getComputedStyle(el).textDecorationLine);
}

test.describe('note body list markers (docs/outliner/body.md)', () => {
  test('a body in a numbered list shows no number and does not offset the count', async ({ page, editor }) => {
    // tree-list-types: note2 lives in a number list.
    await editor.load('tree-list-types');
    await addBody(page, 'note2', 'thebody');

    // The body-wrapper neither numbers nor increments the ordered counter.
    expect(await bodyWrapperPseudoContent(page, '::before')).toBe('none');
    const wrapperIncrement = await bodyWrapper(page).evaluate(
      (el) => globalThis.getComputedStyle(el).counterIncrement
    );
    expect(wrapperIncrement).toBe('none');
  });

  test('a body in a check list shows no checkbox', async ({ page, editor }) => {
    // tree-list-types: note4 lives in a check list.
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'thebody');

    expect(await bodyWrapperPseudoContent(page, '::after')).toBe('none');
  });

  test('a body in a bullet list aligns with its owning note text', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'bulletbody');

    await expectAlignedTextLeft(page, 'note1', 'bulletbody');
  });

  test('a body in a numbered list aligns with its owning note text', async ({ page, editor }) => {
    await editor.load('tree-list-types');
    await addBody(page, 'note2', 'numberbody');

    await expectAlignedTextLeft(page, 'note2', 'numberbody');
  });

  test('a body in a check list aligns with its owning note text', async ({ page, editor }) => {
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'checkbody');

    await expectAlignedTextLeft(page, 'note4', 'checkbody');
  });

  test('a body owned by a checked task is crossed out', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    expect(await bodyTextDecorationLine(page, 'Done task body')).toContain('line-through');
  });

  test('a body in a check list carries no checkbox classes or hit area', async ({ page, editor }) => {
    // tree-list-types: note4 lives in a check list. The body-wrapper is not a
    // list item, so it never gets the checked/unchecked classes that would give
    // it a checkbox hit area — clicking beside the body cannot toggle anything.
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'thebody');

    const wrapper = bodyWrapper(page);
    await expect(wrapper).not.toHaveClass(/list-item-checked/);
    await expect(wrapper).not.toHaveClass(/list-item-unchecked/);
    await expect(wrapper).not.toHaveClass(/\blist-item\b/);
  });

  test('a body in a check list is not exposed as a checkbox to accessibility', async ({ page, editor }) => {
    // The BodyWrapperNode's DOM never emits checkbox semantics, so there is
    // nothing to strip and nothing exposed.
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'thebody');

    const wrapper = bodyWrapper(page);
    await expect(wrapper).not.toHaveAttribute('role', 'checkbox');
    await expect(wrapper).not.toHaveAttribute('aria-checked');
  });
});
