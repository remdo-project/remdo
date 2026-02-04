import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

test.describe('Fold toggle icons', () => {
  test('shows minus icon on hover for notes with children', async ({ page, editor }) => {
    await editor.load('tree');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();
    await expect(listItem).toBeVisible();

    const menuButton = editorLocator(page).locator('.note-controls__button--menu');
    const foldButton = editorLocator(page).locator('.note-controls__button--expanded');

    const before = await listItem.evaluate((element) => {
      const nextSibling = element.nextElementSibling;
      const hasChildren = Boolean(nextSibling && nextSibling.classList.contains('list-nested-item'));
      const beforeStyle = globalThis.getComputedStyle(element, '::before');
      const maskImage = beforeStyle.maskImage;
      const webkitMaskImage = beforeStyle.getPropertyValue('-webkit-mask-image');
      const resolved = maskImage && maskImage !== 'none' ? maskImage : webkitMaskImage;
      return { hasChildren, mask: resolved };
    });

    expect(before.hasChildren).toBe(true);
    expect(before.mask).toContain('bullet-circle.svg');

    await listItem.hover();

    await expect(menuButton).toBeVisible();
    await expect(foldButton).toBeVisible();

    const after = await foldButton.evaluate((element) => {
      const iconStyle = globalThis.getComputedStyle(element);
      const maskImage = iconStyle.maskImage;
      const webkitMaskImage = iconStyle.getPropertyValue('-webkit-mask-image');
      return maskImage && maskImage !== 'none' ? maskImage : webkitMaskImage;
    });

    expect(after).toContain('minus.svg');
  });

  test('shows menu icon on hover for leaf notes', async ({ page, editor }) => {
    await editor.load('tree');

    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note1' }).first();
    await expect(listItem).toBeVisible();

    await listItem.hover();

    const menuButton = editorLocator(page).locator('.note-controls__button--menu');
    await expect(menuButton).toBeVisible();

    const mask = await menuButton.evaluate((element) => {
      const iconStyle = globalThis.getComputedStyle(element);
      const maskImage = iconStyle.maskImage;
      const webkitMaskImage = iconStyle.getPropertyValue('-webkit-mask-image');
      return maskImage && maskImage !== 'none' ? maskImage : webkitMaskImage;
    });

    expect(mask).toContain('menu-2.svg');
    await expect(editorLocator(page).locator('.note-controls__button--expanded')).toHaveCount(0);
    await expect(editorLocator(page).locator('.note-controls__button--folded')).toHaveCount(0);
  });

  test('keeps icons visible across the editor row width', async ({ page, editor }) => {
    await editor.load('tree-complex');

    const input = editorLocator(page).locator('.editor-input').first();
    const listItem = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    const controls = editorLocator(page).locator('.note-controls');
    await expect(listItem).toBeVisible();

    const [editorBox, itemBox] = await Promise.all([input.boundingBox(), listItem.boundingBox()]);
    expect(editorBox).not.toBeNull();
    expect(itemBox).not.toBeNull();
    if (!editorBox || !itemBox) {
      return;
    }

    const centerY = itemBox.y + itemBox.height / 2;
    const insideLeftX = editorBox.x + 2;
    const outsideLeftX = editorBox.x - 2;

    await page.mouse.move(itemBox.x + itemBox.width / 2, centerY);
    await expect(controls).toBeVisible();

    await page.mouse.move(insideLeftX, centerY);
    await expect(controls).toBeVisible();

    await page.mouse.move(outsideLeftX, centerY);
    await expect(controls).toHaveCount(0);
  });
});
