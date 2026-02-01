import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

const getBulletMetrics = async (listItem: Locator) => {
  return listItem.evaluate((element: HTMLElement) => {
    const target = element.closest('li.list-item') ?? element;
    const style = globalThis.getComputedStyle(target, '::before');
    const rect = target.getBoundingClientRect();
    const left = Number.parseFloat(style.left);
    const baseLeft = rect.left + (Number.isFinite(left) ? left : 0);
    const textNode = target.querySelector('[data-lexical-text="true"]')?.firstChild;
    let lineCenterY = rect.top + rect.height / 2;
    if (textNode) {
      const text = textNode.textContent ?? '';
      const range = document.createRange();
      const endOffset = Math.min(1, text.length);
      range.setStart(textNode, 0);
      range.setEnd(textNode, endOffset);
      const rangeRect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (rangeRect.height > 0) {
        lineCenterY = rangeRect.top + rangeRect.height / 2;
      }
    }
    const fallbackPoint = { x: baseLeft + 1, y: lineCenterY };
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

test.describe('Zoom visibility', () => {
  test('hides non-descendants when zoomed', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
    const note3 = editorRoot.locator('li.list-item', { hasText: 'note3' }).first();

    const metrics = await getBulletMetrics(note1);
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
    await page.mouse.click(metrics.x, metrics.y);
    await expect(note3).toBeHidden();

    await page.getByRole('button', { name: editor.docId }).click();
    await expect(note3).toBeVisible();
  });

  test('auto-expands zoom when Enter creates a sibling', async ({ page, editor }) => {
    await editor.load('flat');

    const editorRoot = editorLocator(page);
    const note2 = editorRoot.locator('li.list-item:not(.list-nested-item)', { hasText: 'note2' }).first();
    const metrics = await getBulletMetrics(note2);

    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note2$`));
    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`/n/${editor.docId}`);
    await expect(editorRoot.locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
  });

  test('auto-expands zoom when Delete merges a sibling outside the subtree', async ({ page, editor }) => {
    await editor.load('flat');

    const editorRoot = editorLocator(page);
    const note2 = editorRoot.locator('li.list-item', { hasText: 'note2' }).first();
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
    const metrics = await getBulletMetrics(note2);

    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note2$`));

    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Delete');

    await expect(page).toHaveURL(`/n/${editor.docId}`);
    await expect(note1).toBeVisible();
  });

  test('auto-expands zoom when indenting the zoom root', async ({ page, editor }) => {
    await editor.load('flat');

    const editorRoot = editorLocator(page);
    const note2 = editorRoot.locator('li.list-item', { hasText: 'note2' }).first();
    const metrics = await getBulletMetrics(note2);

    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note2$`));
    await setCaretAtText(page, 'note2', 0);
    await page.keyboard.press('Tab');

    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note1$`));
    await expect(editorRoot.locator('li.list-item', { hasText: 'note3' }).first()).toBeHidden();
  });

  test('auto-expands zoom when multi-line paste inserts siblings', async ({ page, editor }) => {
    await editor.load('flat');

    const editorRoot = editorLocator(page);
    const note2 = editorRoot.locator('li.list-item', { hasText: 'note2' }).first();
    const metrics = await getBulletMetrics(note2);

    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note2$`));
    await setCaretAtText(page, 'note2', 1);
    await pastePlainText(page, 'A\nB');

    await expect(page).toHaveURL(`/n/${editor.docId}`);
    await expect(editorRoot.locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
  });

  test('auto-expands zoom when outdenting a descendant', async ({ page, editor }) => {
    await editor.load('tree-complex');

    const editorRoot = editorLocator(page);
    const note2Text = editorRoot.locator('[data-lexical-text="true"]', { hasText: 'note2' }).first();
    const note4 = editorRoot.locator('li.list-item', { hasText: 'note4' }).first();
    const metrics = await getBulletMetrics(note2Text);

    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note2$`));

    await setCaretAtText(page, 'note3', 0);
    await page.keyboard.press('Shift+Tab');

    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note1$`));
    await expect(note4).toBeVisible();
  });

  test('zoomed child aligns to root indentation', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note2Text = editorRoot.locator('[data-lexical-text="true"]', { hasText: 'note2' }).first();
    const metrics = await getBulletMetrics(note2Text);

    await page.mouse.click(metrics.x, metrics.y);
    await expect(editorRoot.locator('li.list-item', { hasText: 'note3' }).first()).toBeHidden();

    const { listPaddingLeft, listMarginLeft, wrapperPaddingLeft } = await note2Text.evaluate((element) => {
      const item = element.closest('li.list-item');
      const list = item?.closest('ul') ?? null;
      const wrapper = list?.parentElement ?? null;
      const listStyle = list ? globalThis.getComputedStyle(list) : null;
      const wrapperStyle = wrapper ? globalThis.getComputedStyle(wrapper) : null;
      return {
        listPaddingLeft: Number.parseFloat(listStyle?.paddingLeft ?? '0') || 0,
        listMarginLeft: Number.parseFloat(listStyle?.marginLeft ?? '0') || 0,
        wrapperPaddingLeft: Number.parseFloat(wrapperStyle?.paddingLeft ?? '0') || 0,
      };
    });

    expect(listPaddingLeft).toBe(0);
    expect(listMarginLeft).toBe(0);
    expect(wrapperPaddingLeft).toBe(0);
  });
});

async function pastePlainText(page: Parameters<typeof editorLocator>[0], text: string) {
  const input = editorLocator(page).locator('.editor-input').first();
  await input.evaluate((element, payload) => {
    const data = new DataTransfer();
    data.setData('text/plain', payload);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }, text);
}
