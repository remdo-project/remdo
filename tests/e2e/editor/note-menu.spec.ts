import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

const menuLocator = (page: Parameters<typeof editorLocator>[0]) =>
  editorLocator(page).locator('[data-note-menu]');
const menuItem = (page: Parameters<typeof editorLocator>[0], id: string) =>
  editorLocator(page).locator(`[data-note-menu-item="${id}"]`);

const openMenuForNote = async (page: Parameters<typeof editorLocator>[0], label: string) => {
  const listItem = editorLocator(page)
    .locator('li.list-item:not(.list-nested-item)')
    .filter({ hasText: label })
    .first();
  await expect(listItem).toBeVisible();

  const listItemBox = await listItem.boundingBox();
  if (!listItemBox) {
    throw new Error('Expected list item to have a bounding box.');
  }
  await page.mouse.move(
    listItemBox.x + listItemBox.width / 2,
    listItemBox.y + listItemBox.height / 2
  );

  const menuButton = editorLocator(page).locator('.note-controls__button--menu');
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const menu = menuLocator(page);
  await expect(menu).toHaveCount(1);

  return { listItem, menu, menuButton };
};

test.describe('Note menu', () => {
  test('opens and closes via icon, outside click, and Escape', async ({ page, editor }) => {
    await editor.load('tree');

    const { menu } = await openMenuForNote(page, 'note2');
    await page.getByRole('button', { name: editor.docId }).first().click();
    await expect(menu).toHaveCount(0);

    await openMenuForNote(page, 'note2');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('opens on double-shift and targets the caret note', async ({ page, editor }) => {
    await editor.load('tree');

    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('Shift');
    await page.keyboard.press('Shift');

    const menu = menuLocator(page);
    await expect(menu).toHaveCount(1);
    await expect(menuItem(page, 'fold')).toHaveCount(0);
    await expect(menuItem(page, 'zoom')).toHaveCount(1);
  });

  test('double-shift is canceled by other keys', async ({ page, editor }) => {
    await editor.load('tree');

    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('Shift');
    await page.keyboard.press('A');
    await page.keyboard.press('Shift');

    const menu = menuLocator(page);
    await expect(menu).toHaveCount(0);
  });

  test('fold actions close the menu and toggle state', async ({ page, editor }) => {
    await editor.load('tree');

    const { listItem, menu } = await openMenuForNote(page, 'note2');
    await menuItem(page, 'fold').click();
    await expect(menu).toHaveCount(0);
    await expect(listItem).toHaveAttribute('data-folded', 'true');

    await openMenuForNote(page, 'note2');
    await page.keyboard.press('f');
    await expect(menu).toHaveCount(0);
    await expect(listItem).not.toHaveAttribute('data-folded', 'true');
  });

  test('zoom actions close the menu and update the URL', async ({ page, editor }) => {
    await editor.load('tree');

    const { menu } = await openMenuForNote(page, 'note2');
    await menuItem(page, 'zoom').click();
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/\?zoom=note2$/);

    await openMenuForNote(page, 'note2');
    await page.keyboard.press('z');
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/\?zoom=note2$/);
  });

  test('hides fold action for leaf notes', async ({ page, editor }) => {
    await editor.load('tree');

    const { menu } = await openMenuForNote(page, 'note1');
    await expect(menuItem(page, 'fold')).toHaveCount(0);
    await expect(menuItem(page, 'zoom')).toHaveCount(1);
    await expect(menu).toHaveCount(1);
  });

  test('uses Mantine default arrow navigation loop', async ({ page, editor }) => {
    await editor.load('tree');

    await openMenuForNote(page, 'note2');

    const foldItem = menuItem(page, 'fold');
    const zoomItem = menuItem(page, 'zoom');

    await foldItem.focus();
    await expect(foldItem).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(zoomItem).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(foldItem).toBeFocused();
  });
});
