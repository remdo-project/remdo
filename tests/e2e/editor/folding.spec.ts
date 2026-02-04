import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

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

    const listItemBox = (await listItem.boundingBox())!;
    await page.mouse.move(listItemBox.x + listItemBox.width / 2, listItemBox.y + listItemBox.height / 2);
    const foldButton = editorLocator(page).locator('.note-controls__button--expanded');
    await expect(foldButton).toBeVisible();
    await foldButton.click();

    await expect(listItem).toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeHidden();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', folded: true, children: [{ noteId: 'note3', text: 'note3' }] },
    ]);

    const expandButton = editorLocator(page).locator('.note-controls__button--folded');
    await expect(expandButton).toBeVisible();
    await expandButton.click();
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

    const listItemBox = (await listItem.boundingBox())!;
    await page.mouse.move(listItemBox.x + listItemBox.width / 2, listItemBox.y + listItemBox.height / 2);
    const menuButton = editorLocator(page).locator('.note-controls__button--menu');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    await expect(listItem).not.toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeVisible();
  });

  test('folding collapses descendant selection to the folded note', async ({ page, editor }) => {
    await editor.load('tree');

    await setCaretAtText(page, 'note3', 2);

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    const listItemBox = (await listItem.boundingBox())!;
    await page.mouse.move(listItemBox.x + listItemBox.width / 2, listItemBox.y + listItemBox.height / 2);
    const foldButton = editorLocator(page).locator('.note-controls__button--expanded');
    await expect(foldButton).toBeVisible();
    await foldButton.click();

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
