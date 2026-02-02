import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';
import { waitForSynced } from './_support/bridge';

const getBulletMetrics = async (listItem: Locator) => {
  return listItem.evaluate((element: HTMLElement) => {
    const target = element.closest('li.list-item') ?? element;
    const style = globalThis.getComputedStyle(target, '::before');
    const rect = target.getBoundingClientRect();
    const left = Number.parseFloat(style.left);
    const baseLeft = rect.left + (Number.isFinite(left) ? left : 0);
    const fallbackPoint = { x: baseLeft + 1, y: rect.top + rect.height / 2 };
    const rawContent = style.content;
    const content =
      rawContent === 'none' || rawContent === 'normal'
        ? ''
        : rawContent.replaceAll('"', '').replaceAll("'", '');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !content) {
      return fallbackPoint;
    }
    const font =
      style.font && style.font !== 'normal'
        ? style.font
        : `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
    ctx.font = font;
    const metrics = ctx.measureText(content);
    const glyphWidth = metrics.width;
    if (!Number.isFinite(glyphWidth) || glyphWidth <= 0) {
      return fallbackPoint;
    }
    const containerWidth = Number.parseFloat(style.width);
    let offset = 0;
    if (Number.isFinite(containerWidth) && containerWidth > glyphWidth) {
      if (style.textAlign === 'center') {
        offset = (containerWidth - glyphWidth) / 2;
      } else if (style.textAlign === 'right' || style.textAlign === 'end') {
        offset = containerWidth - glyphWidth;
      }
    }
    return { x: baseLeft + offset + 1, y: rect.top + rect.height / 2 };
  });
};

test.describe('Zoom routing', () => {
  test('adds zoom param on bullet click', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();

    const metrics = await getBulletMetrics(note1);
    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note1$`));
  });

  test('clears zoom param when clicking document breadcrumb', async ({ page, editor }) => {
    await page.goto(`/n/${editor.docId}?zoom=note1`);
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await editor.load('basic');

    await page.getByRole('button', { name: editor.docId }).click();
    await expect(page).toHaveURL(`/n/${editor.docId}`);
  });

  test('invalid zoom param resets to document URL', async ({ page, editor }) => {
    await page.goto(`/n/${editor.docId}?zoom=missing-note`);
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await editor.load('basic');

    await expect(page).toHaveURL(`/n/${editor.docId}`);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
  });

  test('keeps zoom param on initial load', async ({ page, testDocId }) => {
    await page.goto(`/n/${testDocId}?zoom=note1`);
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${testDocId}\?zoom=note1$`));
    await waitForSynced(page);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${testDocId}\?zoom=note1$`));
  });
});
