import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

test.describe('Zoom bullet hover', () => {
  test('matches the rendered bullet width', async ({ page, editor }) => {
    await editor.load('flat');

    const listItem = editorLocator(page).locator('li.list-item').first();
    await expect(listItem).toBeVisible();

    const metrics = await listItem.evaluate((element) => {
      const beforeStyle = globalThis.getComputedStyle(element, '::before');
      const rect = element.getBoundingClientRect();
      const width = Number.parseFloat(beforeStyle.width);
      const height = Number.parseFloat(beforeStyle.height);
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return null;
      }
      const left = Number.parseFloat(beforeStyle.left);
      const top = Number.parseFloat(beforeStyle.top);
      const baseLeft = rect.left + (Number.isFinite(left) ? left : 0);
      const baseTop = rect.top + (Number.isFinite(top) ? top : 0);
      const textNode = element.querySelector('[data-lexical-text="true"]');
      const textRect = textNode ? textNode.getBoundingClientRect() : null;
      return {
        start: baseLeft,
        end: baseLeft + width,
        y: baseTop + height / 2,
        width,
        height,
        textCenterY: textRect ? textRect.top + textRect.height / 2 : null,
      };
    });

    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }

    expect(Math.abs(metrics.width - metrics.height)).toBeLessThanOrEqual(1);
    if (metrics.textCenterY !== null) {
      expect(Math.abs(metrics.textCenterY - metrics.y)).toBeLessThanOrEqual(4);
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
