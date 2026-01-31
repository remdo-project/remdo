import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

test.describe('Zoom bullet hover', () => {
  test('matches the rendered bullet width', async ({ page, editor }) => {
    await editor.load('flat');

    const listItem = editorLocator(page).locator('li.list-item').first();
    await expect(listItem).toBeVisible();

    const metrics = await listItem.evaluate((element) => {
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
      const boxLeft = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0;
      const boxRight = Number.isFinite(metrics.actualBoundingBoxRight)
        ? metrics.actualBoundingBoxRight
        : glyphWidth;
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
      const start = baseLeft + offset - boxLeft;
      return { start, end: baseLeft + offset + boxRight, y: rect.top + rect.height / 2 };
    });

    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }

    await page.mouse.move(metrics.end + 10, metrics.y);
    await expect(listItem).not.toHaveAttribute('data-zoom-bullet-hover', 'true');

    await page.mouse.move(metrics.start + 1, metrics.y);
    await expect(listItem).toHaveAttribute('data-zoom-bullet-hover', 'true');

    await page.mouse.move(metrics.end - 1, metrics.y);
    await expect(listItem).toHaveAttribute('data-zoom-bullet-hover', 'true');

    await page.mouse.move(metrics.end + 2, metrics.y);
    await expect(listItem).not.toHaveAttribute('data-zoom-bullet-hover', 'true');
  });
});
