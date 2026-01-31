import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

const getBulletMetrics = async (listItem: Locator) => {
  return listItem.evaluate((element: HTMLElement) => {
    const style = globalThis.getComputedStyle(element, '::before');
    const rect = element.getBoundingClientRect();
    const rawContent = style.content;
    const content =
      rawContent === 'none' || rawContent === 'normal'
        ? ''
        : rawContent.replaceAll('"', '').replaceAll("'", '');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !content) {
      return null;
    }
    const font =
      style.font && style.font !== 'normal'
        ? style.font
        : `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
    ctx.font = font;
    const metrics = ctx.measureText(content);
    const glyphWidth = metrics.width;
    if (!Number.isFinite(glyphWidth) || glyphWidth <= 0) {
      return null;
    }
    const containerWidth = Number.parseFloat(style.width);
    const left = Number.parseFloat(style.left);
    let offset = 0;
    if (Number.isFinite(containerWidth) && containerWidth > glyphWidth) {
      if (style.textAlign === 'center') {
        offset = (containerWidth - glyphWidth) / 2;
      } else if (style.textAlign === 'right' || style.textAlign === 'end') {
        offset = containerWidth - glyphWidth;
      }
    }
    const baseLeft = rect.left + (Number.isFinite(left) ? left : 0);
    return { x: baseLeft + offset + 1, y: rect.top + rect.height / 2 };
  });
};

test.describe('Zoom visibility', () => {
  test('hides non-descendants when zoomed', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
    const note3 = editorRoot.locator('li.list-item', { hasText: 'note3' }).first();

    const metrics = await getBulletMetrics(note1);
    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }

    await page.mouse.click(metrics.x, metrics.y);

    await expect(note1).toBeVisible();
    await expect(editorRoot.locator('li.list-item', { hasText: 'note2' }).first()).toBeVisible();
    await expect(note3).toBeHidden();
  });

  test('breadcrumb clears zoom', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
    const note3 = editorRoot.locator('li.list-item', { hasText: 'note3' }).first();

    const metrics = await getBulletMetrics(note1);
    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }

    await page.mouse.click(metrics.x, metrics.y);
    await expect(note3).toBeHidden();

    await page.getByRole('button', { name: editor.docId }).click();
    await expect(note3).toBeVisible();
  });
});
