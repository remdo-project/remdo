import { expect, test } from '#editor/fixtures';
import type { Page } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

// A body-wrapper is a dedicated `.note-body-wrapper` <li> (the BodyWrapperNode),
// not a `.list-item`, so list markers (bullet, ordered counter, checkbox) — which
// all target `li.list-item` — never apply to it, and it is never a checkbox in
// the accessibility tree (see docs/outliner/body.md). These assert that computed
// state in a real browser, where the marker rules actually apply.

function bodyWrapperForText(page: Page, bodyText: string) {
  return editorLocator(page)
    .locator('li.note-body-wrapper')
    .filter({ hasText: bodyText })
    .first();
}

/** The computed pseudo-element `content` for the li that holds the body. */
function bodyWrapperPseudoContent(
  page: Page,
  bodyText: string,
  pseudo: '::before' | '::after'
) {
  return bodyWrapperForText(page, bodyText).evaluate(
    (el, p) => globalThis.getComputedStyle(el, p).content,
    pseudo
  );
}

async function textLeft(page: Page, label: string): Promise<number> {
  return editorLocator(page)
    .locator('[data-lexical-text="true"]')
    .evaluateAll((elements, text) => {
      const el = elements.find((candidate) => candidate.textContent === text);
      if (!el) {
        throw new Error(`Could not find text node: ${text}`);
      }
      const range = document.createRange();
      range.selectNodeContents(el.firstChild ?? el);
      const { left } = range.getBoundingClientRect();
      return left;
    }, label);
}

async function expectAlignedTextLeft(
  page: Page,
  noteLabel: string,
  bodyText: string
) {
  const [noteLeft, bodyLeft] = await Promise.all([
    textLeft(page, noteLabel),
    textLeft(page, bodyText),
  ]);

  expect(Math.abs(noteLeft - bodyLeft)).toBeLessThan(1);
}

async function bodyTextDecorationLine(
  page: Page,
  bodyText: string
): Promise<string> {
  return editorLocator(page)
    .locator('.note-body')
    .filter({ hasText: bodyText })
    .first()
    .evaluate((el) => globalThis.getComputedStyle(el).textDecorationLine);
}

test.describe('note body list markers (docs/outliner/body.md)', () => {
  test('a body in a numbered list shows no number and does not offset the count', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    // The body-wrapper neither numbers nor increments the ordered counter.
    expect(
      await bodyWrapperPseudoContent(page, 'Second step body', '::before')
    ).toBe('none');
    const wrapperIncrement = await bodyWrapperForText(
      page,
      'Second step body'
    ).evaluate((el) => globalThis.getComputedStyle(el).counterIncrement);
    expect(wrapperIncrement).toBe('none');
  });

  test('a body in a check list shows no checkbox', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    expect(
      await bodyWrapperPseudoContent(page, 'Done task body', '::after')
    ).toBe('none');
  });

  test('a body in a bullet list aligns with its owning note text', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    await expectAlignedTextLeft(page, 'Note with body', 'Second body line');
  });

  test('a body in a numbered list aligns with its owning note text', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    await expectAlignedTextLeft(page, 'Second step', 'Second step body');
  });

  test('a body in a check list aligns with its owning note text', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    await expectAlignedTextLeft(page, 'Done task', 'Done task body');
  });

  test('a body owned by a checked task is crossed out', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    expect(await bodyTextDecorationLine(page, 'Done task body')).toContain('line-through');
  });

  test('a body in a check list carries no checkbox classes or hit area', async ({ page, editor }) => {
    await editor.load('editor-showcase');

    const wrapper = bodyWrapperForText(page, 'Done task body');
    await expect(wrapper).not.toHaveClass(/list-item-checked/);
    await expect(wrapper).not.toHaveClass(/list-item-unchecked/);
    await expect(wrapper).not.toHaveClass(/\blist-item\b/);
  });

  test('a body in a check list is not exposed as a checkbox to accessibility', async ({ page, editor }) => {
    // The BodyWrapperNode's DOM never emits checkbox semantics, so there is
    // nothing to strip and nothing exposed.
    await editor.load('editor-showcase');

    const wrapper = bodyWrapperForText(page, 'Done task body');
    await expect(wrapper).not.toHaveAttribute('role', 'checkbox');
    await expect(wrapper).not.toHaveAttribute('aria-checked');
  });
});
