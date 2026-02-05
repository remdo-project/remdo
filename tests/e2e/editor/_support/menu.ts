import type { Locator, Page } from '#editor/fixtures';
import { expect } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from './locators';

type MenuOpenMethod = 'hover' | 'shortcut';

interface OpenMenuOptions {
  openMethod?: MenuOpenMethod;
  anchor?: 'note' | 'caret';
}

type MenuItemId = 'fold' | 'zoom' | 'list-number' | 'list-check' | 'list-bullet';

interface MenuHandle {
  listItem: Locator;
  menu: Locator;
  item: (id: MenuItemId) => Locator;
  close: () => Promise<void>;
  pressShortcut: (key: 'f' | 'z') => Promise<void>;
  expectOpen: () => Promise<void>;
  expectClosed: () => Promise<void>;
}

const menuLocator = (page: Page): Locator => editorLocator(page).locator('[data-note-menu]');
const menuItem = (page: Page, id: MenuItemId): Locator =>
  editorLocator(page).locator(`[data-note-menu-item="${id}"]`);

const findNoteItem = (page: Page, label: string): Locator =>
  editorLocator(page)
    .locator('li.list-item:not(.list-nested-item)')
    .filter({ hasText: label })
    .first();

const openMenuByHover = async (page: Page, listItem: Locator): Promise<void> => {
  await expect(listItem).toBeVisible();
  const listItemBox = await listItem.boundingBox();
  if (!listItemBox) {
    throw new Error('Expected list item to have a bounding box.');
  }
  await page.mouse.move(listItemBox.x + listItemBox.width / 2, listItemBox.y + listItemBox.height / 2);

  const menuButton = editorLocator(page).locator('.note-controls__button--menu');
  await expect(menuButton).toBeVisible();
  await menuButton.click();
};

const openMenuByShortcut = async (page: Page): Promise<void> => {
  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
};

export const openNoteMenu = async (page: Page, label: string, options?: OpenMenuOptions): Promise<MenuHandle> => {
  const openMethod = options?.openMethod ?? 'hover';
  const anchor = options?.anchor ?? 'note';
  const listItem = findNoteItem(page, label);

  if (anchor === 'caret') {
    await setCaretAtText(page, label, 0);
  }

  await (openMethod === 'hover' ? openMenuByHover(page, listItem) : openMenuByShortcut(page));

  const menu = menuLocator(page);
  await expect(menu).toHaveCount(1);

  return {
    listItem,
    menu,
    item: (id) => menuItem(page, id),
    close: async () => {
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    },
    pressShortcut: async (key) => {
      await page.keyboard.press(key.toUpperCase());
    },
    expectOpen: async () => {
      await expect(menu).toHaveCount(1);
    },
    expectClosed: async () => {
      await expect(menu).toHaveCount(0);
    },
  };
};
