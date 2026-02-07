import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

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

    const listItemBox = (await listItem.boundingBox())!;
    await page.mouse.move(listItemBox.x + listItemBox.width / 2, listItemBox.y + listItemBox.height / 2);

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

    const listItemBox = (await listItem.boundingBox())!;
    await page.mouse.move(listItemBox.x + listItemBox.width / 2, listItemBox.y + listItemBox.height / 2);

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

  test('tracks by controls layer boundary (+1 inside follows, -1 outside stays)', async ({ page, editor }) => {
    await editor.load('basic');

    const container = editorLocator(page);
    const layer = container.locator('.note-controls-layer');
    const controls = container.locator('.note-controls');
    const foldButton = container.locator('.note-controls__button--expanded, .note-controls__button--folded').first();
    const source = container.locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note1' }).first();
    const target = container.locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note3' }).first();
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    if (!sourceBox || !targetBox) {
      throw new Error('Expected source and target bounding boxes.');
    }
    const sourceCenterY = sourceBox.y + sourceBox.height / 2;

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceCenterY);
    await expect(controls).toBeVisible();
    await expect(foldButton).toBeVisible();
    await expect(layer).toBeVisible();

    const [layerBox, controlsBox] = await Promise.all([layer.boundingBox(), controls.boundingBox()]);
    expect(layerBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    if (!layerBox || !controlsBox) {
      throw new Error('Expected layer and controls bounding boxes.');
    }

    const assertControlsInsideLayer = (box: NonNullable<typeof controlsBox>) => {
      expect(box.x).toBeGreaterThanOrEqual(layerBox.x);
      expect(box.y).toBeGreaterThanOrEqual(layerBox.y);
      expect(box.x + box.width).toBeLessThanOrEqual(layerBox.x + layerBox.width);
      expect(box.y + box.height).toBeLessThanOrEqual(layerBox.y + layerBox.height);
    };
    assertControlsInsideLayer(controlsBox);

    const insideX = layerBox.x + 1;
    const outsideX = layerBox.x - 1;
    const targetYs = [targetBox.y + 1, targetBox.y + targetBox.height / 2, targetBox.y + targetBox.height - 1];

    for (const targetY of targetYs) {
      await page.mouse.move(insideX, targetY);
      await expect(controls).toBeVisible();

      const nextControlsBox = await controls.boundingBox();
      expect(nextControlsBox).not.toBeNull();
      if (!nextControlsBox) {
        throw new Error('Expected controls bounding box.');
      }
      assertControlsInsideLayer(nextControlsBox);
      const nextControlsCenter = nextControlsBox.y + nextControlsBox.height / 2;
      expect(nextControlsCenter).toBeGreaterThanOrEqual(targetBox.y);
      expect(nextControlsCenter).toBeLessThanOrEqual(targetBox.y + targetBox.height);
    }

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceCenterY);
    await expect(controls).toBeVisible();

    for (const targetY of targetYs) {
      await page.mouse.move(outsideX, targetY);
      await expect(controls).toBeVisible();

      const nextControlsBox = await controls.boundingBox();
      expect(nextControlsBox).not.toBeNull();
      if (!nextControlsBox) {
        throw new Error('Expected controls bounding box.');
      }
      assertControlsInsideLayer(nextControlsBox);
      const nextControlsCenter = nextControlsBox.y + nextControlsBox.height / 2;
      expect(nextControlsCenter).toBeGreaterThanOrEqual(sourceBox.y);
      expect(nextControlsCenter).toBeLessThanOrEqual(sourceBox.y + sourceBox.height);
    }
  });

  test('tracks the caret when the selection moves', async ({ page, editor }) => {
    await editor.load('tree');

    const controls = editorLocator(page).locator('.note-controls');
    const note1 = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note1' }).first();
    const note2 = editorLocator(page).locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();

    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('ArrowRight');
    await expect(controls).toBeVisible();

    const [note1Box, controlsBox] = await Promise.all([note1.boundingBox(), controls.boundingBox()]);
    expect(note1Box).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    if (!note1Box || !controlsBox) {
      return;
    }
    const controlsCenter = controlsBox.y + controlsBox.height / 2;
    expect(controlsCenter).toBeGreaterThan(note1Box.y);
    expect(controlsCenter).toBeLessThan(note1Box.y + note1Box.height);

    await setCaretAtText(page, 'note2', 0);
    await expect(controls).toBeVisible();

    const [note2Box, nextControlsBox] = await Promise.all([note2.boundingBox(), controls.boundingBox()]);
    expect(note2Box).not.toBeNull();
    expect(nextControlsBox).not.toBeNull();
    if (!note2Box || !nextControlsBox) {
      return;
    }
    const nextControlsCenter = nextControlsBox.y + nextControlsBox.height / 2;
    expect(nextControlsCenter).toBeGreaterThan(note2Box.y);
    expect(nextControlsCenter).toBeLessThan(note2Box.y + note2Box.height);
  });

  test('keeps controls on the last hovered note when the pointer leaves the editor', async ({ page, editor }) => {
    await editor.load('tree');

    const container = editorLocator(page);
    const controls = container.locator('.note-controls');
    const note2 = container.locator('li.list-item:not(.list-nested-item)').filter({ hasText: 'note2' }).first();

    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('ArrowRight');

    const [containerBox, note2Box] = await Promise.all([
      container.boundingBox(),
      note2.boundingBox(),
    ]);
    expect(containerBox).not.toBeNull();
    expect(note2Box).not.toBeNull();
    if (!containerBox || !note2Box) {
      return;
    }

    const note2CenterX = note2Box.x + note2Box.width / 2;
    const note2CenterY = note2Box.y + note2Box.height / 2;
    await page.mouse.move(note2CenterX, note2CenterY);
    await expect(controls).toBeVisible();

    const controlsBox = await controls.boundingBox();
    expect(controlsBox).not.toBeNull();
    if (!controlsBox) {
      return;
    }
    const controlsCenter = controlsBox.y + controlsBox.height / 2;
    expect(controlsCenter).toBeGreaterThan(note2Box.y);
    expect(controlsCenter).toBeLessThan(note2Box.y + note2Box.height);

    const viewport = page.viewportSize();
    const candidates = [
      { x: containerBox.x - 20, y: containerBox.y + 10 },
      { x: containerBox.x + containerBox.width + 20, y: containerBox.y + 10 },
      { x: containerBox.x + 10, y: containerBox.y - 20 },
      { x: containerBox.x + 10, y: containerBox.y + containerBox.height + 20 },
    ];
    const initialPoint = candidates[0];
    if (!initialPoint) {
      throw new Error('Expected outside point candidates.');
    }
    let outsidePoint = initialPoint;
    for (const candidate of candidates) {
      let { x, y } = candidate;
      if (viewport) {
        x = Math.min(Math.max(x, 1), viewport.width - 1);
        y = Math.min(Math.max(y, 1), viewport.height - 1);
      }
      const isOutside =
        x < containerBox.x ||
        x > containerBox.x + containerBox.width ||
        y < containerBox.y ||
        y > containerBox.y + containerBox.height;
      if (isOutside) {
        outsidePoint = { x, y };
        break;
      }
    }
    await page.mouse.move(outsidePoint.x, outsidePoint.y);

    await expect(controls).toBeVisible();

    const nextControlsBox = await controls.boundingBox();
    expect(nextControlsBox).not.toBeNull();
    if (!nextControlsBox) {
      throw new Error('Expected controls bounding box.');
    }
    const nextControlsCenter = nextControlsBox.y + nextControlsBox.height / 2;
    expect(nextControlsCenter).toBeGreaterThanOrEqual(note2Box.y);
    expect(nextControlsCenter).toBeLessThanOrEqual(note2Box.y + note2Box.height);
  });
});
