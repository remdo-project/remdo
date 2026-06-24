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

  test('clicking the checkbox slot beside a body does not toggle the body-wrapper', async ({ page, editor }) => {
    // tree-list-types: note4 lives in a check list. The body-wrapper still
    // carries the unchecked class (and so the checkbox hit area), but it is not a
    // checklist item — clicking its hidden checkbox slot must not check it.
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'thebody');

    const wrapper = editorLocator(page).locator('li.list-item:has(> .note-body)').first();
    await expect(wrapper).toHaveClass(/list-item-unchecked/);

    // Click inside the checkbox slot: liRect.left + (--checkbox-left .. +width).
    // The custom properties are calc() strings, so resolve them to px by probing
    // an element whose width is set to each value.
    const slot = await wrapper.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const resolvePx = (property: string) => {
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.width = `var(${property})`;
        el.append(probe);
        const px = probe.getBoundingClientRect().width;
        probe.remove();
        return px;
      };
      const left = resolvePx('--checkbox-left');
      const width = resolvePx('--checkbox-width');
      return { x: rect.left + left + width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(slot.x, slot.y);

    await expect(wrapper).toHaveClass(/list-item-unchecked/);
    await expect(wrapper).not.toHaveClass(/list-item-checked/);
  });

  test('a body in a check list is not exposed as a checkbox to accessibility', async ({ page, editor }) => {
    // tree-list-types: note4 lives in a check list. A leaf li in a check list
    // would otherwise get role="checkbox"/aria-checked from Lexical; a body is
    // not a checklist item, so those must be stripped (docs/outliner/body.md).
    await editor.load('tree-list-types');
    await addBody(page, 'note4', 'thebody');

    const wrapper = editorLocator(page).locator('li.list-item:has(> .note-body)').first();
    await expect(wrapper).not.toHaveAttribute('role', 'checkbox');
    await expect(wrapper).not.toHaveAttribute('aria-checked');
  });
});
