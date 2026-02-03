import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

async function getTogglePoint(listItem: ReturnType<typeof editorLocator>, side: 'left' | 'right') {
  const point = await listItem.evaluate((element, chosenSide) => {
    const after = globalThis.getComputedStyle(element, '::after');
    const width = Number.parseFloat(after.width);
    const height = Number.parseFloat(after.height);
    const left = Number.parseFloat(after.left);
    const top = Number.parseFloat(after.top);
    if (![width, height, left, top].every(Number.isFinite)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const afterLeft = rect.left + left;
    const afterTop = rect.top + top;
    const iconSize = height;
    const x = chosenSide === 'right' ? afterLeft + width - iconSize / 2 : afterLeft + iconSize / 2;
    const y = afterTop + height / 2;
    return { x, y };
  }, side);

  if (!point) {
    throw new Error('Fold toggle point could not be resolved.');
  }

  return point;
}

test.describe('Folding', () => {
  test('toggles folding via plus/minus and hides descendants', async ({ page, editor }) => {
    await editor.load('tree');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    const childItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    await expect(listItem).toBeVisible();
    await expect(childItem).toBeVisible();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);

    await listItem.hover();
    const toggle = await getTogglePoint(listItem, 'right');
    await page.mouse.click(toggle.x, toggle.y);

    await expect(listItem).toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeHidden();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', folded: true, children: [{ noteId: 'note3', text: 'note3' }] },
    ]);

    await page.mouse.click(toggle.x, toggle.y);
    await expect(listItem).not.toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeVisible();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
  });

  test('menu icon does not toggle folding', async ({ page, editor }) => {
    await editor.load('tree');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    const childItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    await expect(listItem).toBeVisible();
    await expect(childItem).toBeVisible();

    await listItem.hover();
    const menu = await getTogglePoint(listItem, 'left');
    await page.mouse.click(menu.x, menu.y);

    await expect(listItem).not.toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeVisible();
  });

  test('folding collapses descendant selection to the folded note', async ({ page, editor }) => {
    await editor.load('tree');

    await setCaretAtText(page, 'note3', 2);

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    await listItem.hover();
    const toggle = await getTogglePoint(listItem, 'right');
    await page.mouse.click(toggle.x, toggle.y);

    await expect(listItem).toHaveAttribute('data-folded', 'true');

    const selection = await page.evaluate(() => {
      const sel = globalThis.getSelection();
      if (!sel || sel.rangeCount === 0) {
        return null;
      }
      const anchor = sel.anchorNode;
      const text = anchor?.textContent ?? null;
      return {
        isCollapsed: sel.isCollapsed,
        anchorText: text,
        anchorOffset: sel.anchorOffset,
      };
    });

    expect(selection).not.toBeNull();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorText).toContain('note2');
    expect(selection?.anchorOffset).toBe((selection?.anchorText ?? '').length);
  });
});
