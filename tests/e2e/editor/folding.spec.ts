import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { openNoteMenu } from './_support/menu';

test.describe('Folding', () => {
  test('toggles folding via double-shift then F and hides descendants', async ({ page, editor }) => {
    await editor.load('tree');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    const childItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    await expect(listItem).toBeVisible();
    await expect(childItem).toBeVisible();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);

    await setCaretAtText(page, 'note2', 0);
    const foldMenu = await openNoteMenu(page, 'note2', { anchor: 'caret', openMethod: 'shortcut' });
    await foldMenu.pressShortcut('f');
    await foldMenu.expectClosed();

    await expect(listItem).toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeHidden();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', folded: true, children: [{ noteId: 'note3', text: 'note3' }] },
    ]);

    const unfoldMenu = await openNoteMenu(page, 'note2', { anchor: 'caret', openMethod: 'shortcut' });
    await unfoldMenu.pressShortcut('f');
    await unfoldMenu.expectClosed();
    await expect(listItem).not.toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeVisible();
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);
  });

  test('folding a note that has a body still hides its children', async ({ page, editor }) => {
    // tree: note1; note2 > note3. Give note2 a body so a body-wrapper sits
    // between note2 and its children-wrapper, then fold and verify the child
    // hides (the fold CSS must reach across the body-wrapper).
    await editor.load('tree');

    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('note2 body');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    const childItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    await expect(childItem).toBeVisible();

    await setCaretAtText(page, 'note2', 0);
    const foldMenu = await openNoteMenu(page, 'note2', { anchor: 'caret', openMethod: 'shortcut' });
    await foldMenu.pressShortcut('f');
    await foldMenu.expectClosed();

    await expect(listItem).toHaveAttribute('data-folded', 'true');
    await expect(childItem).toBeHidden();
  });

  test('opening note menu via shortcut does not toggle folding', async ({ page, editor }) => {
    await editor.load('tree');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    const childItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    await expect(listItem).toBeVisible();
    await expect(childItem).toBeVisible();

    await openNoteMenu(page, 'note2', { anchor: 'caret', openMethod: 'shortcut' });

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
