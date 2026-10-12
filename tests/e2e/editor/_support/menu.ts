import type { Locator, Page } from '#editor/fixtures';
import { expect } from '#editor/fixtures';
import { editorLocator, noteRow, setCaretAtText } from './locators';

type MenuOpenMethod = 'hover' | 'shortcut';

interface OpenMenuOptions {
  openMethod?: MenuOpenMethod;
  anchor?: 'note' | 'caret';
}

type MenuItemId =
  | 'toggle-checked'
  | 'fold'
  | 'zoom'
  | 'zoom-out'
  | 'list-number'
  | 'list-check'
  | 'list-bullet'
  | 'view-fold-to-level';

interface MenuHandle {
  listItem: Locator;
  menu: Locator;
  item: (id: MenuItemId) => Locator;
  /** All action items in DOM (visual + arrow-roving) order. */
  itemOrder: Locator;
  close: () => Promise<void>;
  pressShortcut: (key: string) => Promise<void>;
  expectOpen: () => Promise<void>;
  expectClosed: () => Promise<void>;
}

const menuLocator = (page: Page): Locator => editorLocator(page).locator('[data-note-menu]');
const menuItem = (page: Page, id: MenuItemId): Locator =>
  editorLocator(page).locator(`[data-note-menu-item="${id}"]`);
const menuItems = (page: Page): Locator =>
  editorLocator(page).locator('[data-note-menu-item]');

const openMenuByHover = async (page: Page, listItem: Locator): Promise<void> => {
  const existing = menuLocator(page);
  if (await existing.count() > 0) {
    await page.keyboard.press('Escape');
    await expect(existing).toHaveCount(0);
  }
  await expect(listItem).toBeVisible();
  await listItem.locator('[data-lexical-text="true"]').first().hover();

  const menuButton = editorLocator(page).locator('.note-controls__button--menu');
  await expect(menuButton).toBeVisible();
  await menuButton.click();
};

const openMenuByShortcut = async (page: Page): Promise<void> => {
  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
};

const ROW_MENU_GAP = 16;

/**
 * The menu is fully inside the viewport width and touches the row's vertical band.
 * `besideRow` also requires it to start right of the row's left edge, as beside a caret.
 */
export const expectMenuNearRow = async (
  menu: Locator,
  row: Locator,
  viewportWidth: number,
  { besideRow = false } = {},
): Promise<void> => {
  const menuBox = (await menu.boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  if (besideRow) {
    expect(menuBox.x).toBeGreaterThan(rowBox.x);
  }
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewportWidth);
  expect(menuBox.y).toBeLessThanOrEqual(rowBox.y + rowBox.height + ROW_MENU_GAP);
  expect(menuBox.y + menuBox.height).toBeGreaterThanOrEqual(rowBox.y - ROW_MENU_GAP);
};

export const openNoteMenu = async (page: Page, label: string, options?: OpenMenuOptions): Promise<MenuHandle> => {
  const openMethod = options?.openMethod ?? 'hover';
  const anchor = options?.anchor ?? 'note';
  const listItem = noteRow(page, label);

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
    itemOrder: menuItems(page),
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
