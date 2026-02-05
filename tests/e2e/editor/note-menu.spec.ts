import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { openNoteMenu } from './_support/menu';

test.describe('Note menu', () => {
  test('opens and closes via icon, outside click, and Escape', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    await page.getByRole('button', { name: editor.docId }).first().click();
    await menu.expectClosed();

    await openNoteMenu(page, 'note2');
    await page.keyboard.press('Escape');
    await menu.expectClosed();
  });

  test('opens on double-shift and targets the caret note', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note1', { anchor: 'caret', openMethod: 'shortcut' });
    await menu.expectOpen();
    await expect(menu.item('fold')).toHaveCount(0);
    await expect(menu.item('zoom')).toHaveCount(1);
    await expect(menu.item('list-number')).toHaveCount(0);
    await expect(menu.item('list-check')).toHaveCount(0);
    await expect(menu.item('list-bullet')).toHaveCount(0);
  });

  test('closes when clicking the menu button again', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    const menuButton = editorLocator(page).locator('.note-controls__button--menu');
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await menu.expectClosed();
  });

  test('keeps controls anchored while hovering the menu', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    const controls = editorLocator(page).locator('.note-controls');
    const note2 = editorLocator(page)
      .locator('li.list-item:not(.list-nested-item)')
      .filter({ hasText: 'note2' })
      .first();

    await expect(controls).toBeVisible();
    await expect(menu.item('zoom')).toBeVisible();

    const [note2Box, controlsBox] = await Promise.all([note2.boundingBox(), controls.boundingBox()]);
    expect(note2Box).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    if (!note2Box || !controlsBox) {
      return;
    }
    const controlsCenter = controlsBox.y + controlsBox.height / 2;
    expect(controlsCenter).toBeGreaterThan(note2Box.y);
    expect(controlsCenter).toBeLessThan(note2Box.y + note2Box.height);

    await menu.item('zoom').hover();

    const nextControlsBox = await controls.boundingBox();
    expect(nextControlsBox).not.toBeNull();
    if (!nextControlsBox) {
      return;
    }
    const nextControlsCenter = nextControlsBox.y + nextControlsBox.height / 2;
    expect(nextControlsCenter).toBeGreaterThan(note2Box.y);
    expect(nextControlsCenter).toBeLessThan(note2Box.y + note2Box.height);
  });

  test('double-shift is canceled by other keys', async ({ page, editor }) => {
    await editor.load('tree');

    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('Shift');
    await page.keyboard.press('A');
    await page.keyboard.press('Shift');

    await expect(editorLocator(page).locator('[data-note-menu]')).toHaveCount(0);
  });

  test('fold actions close the menu and toggle state', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    await menu.item('fold').click();
    await menu.expectClosed();
    await expect(menu.listItem).toHaveAttribute('data-folded', 'true');

    await openNoteMenu(page, 'note2');
    await page.keyboard.press('f');
    await menu.expectClosed();
    await expect(menu.listItem).not.toHaveAttribute('data-folded', 'true');
  });

  test('zoom actions close the menu and update the URL', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    await menu.item('zoom').click();
    await menu.expectClosed();
    await expect(page).toHaveURL(/\?zoom=note2$/);

    await openNoteMenu(page, 'note2');
    await page.keyboard.press('z');
    await menu.expectClosed();
    await expect(page).toHaveURL(/\?zoom=note2$/);
  });

  test('shows list type actions for notes with children', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    await menu.expectOpen();
    await expect(menu.item('list-number')).toHaveCount(1);
    await expect(menu.item('list-check')).toHaveCount(1);
    await expect(menu.item('list-bullet')).toHaveCount(0);
  });

  test('switches child list types and updates visuals', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');
    await menu.item('list-number').click();
    await menu.expectClosed();

    const childItem = editorLocator(page)
      .locator('li.list-item:not(.list-nested-item)')
      .filter({ hasText: 'note3' })
      .first();
    await expect(childItem).toHaveCount(1);
    await expect(childItem.locator('xpath=ancestor::ol[1]')).toHaveClass(/list-ol/);

    await openNoteMenu(page, 'note2');
    await menu.item('list-check').click();

    await expect(childItem).toHaveClass(/list-item-unchecked/);
    await expect(childItem).toHaveAttribute('role', 'checkbox');

    await childItem.focus();
    await expect(childItem).toBeFocused();
    await page.keyboard.press('Space');
    await expect(childItem).toHaveAttribute('aria-checked', 'true');
    await expect(childItem).toHaveClass(/list-item-checked/);
  });

  test('hides fold action for leaf notes', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note1');
    await expect(menu.item('fold')).toHaveCount(0);
    await expect(menu.item('zoom')).toHaveCount(1);
    await expect(menu.item('list-number')).toHaveCount(0);
    await expect(menu.item('list-check')).toHaveCount(0);
    await expect(menu.item('list-bullet')).toHaveCount(0);
    await menu.expectOpen();
  });

  test('uses Mantine default arrow navigation loop', async ({ page, editor }) => {
    await editor.load('tree');

    const menu = await openNoteMenu(page, 'note2');

    const foldItem = menu.item('fold');
    const numberItem = menu.item('list-number');
    const checkItem = menu.item('list-check');
    const zoomItem = menu.item('zoom');

    await foldItem.focus();
    await expect(foldItem).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(zoomItem).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(numberItem).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(checkItem).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(foldItem).toBeFocused();
  });
});
