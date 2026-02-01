import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

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

test('auto-zoom scrolls to the edited note', async ({ page, editor }) => {
  await page.setViewportSize({ width: 900, height: 320 });
  await page.addStyleTag({
    content: `
      .editor-input {
        max-height: 120px;
        overflow-y: auto;
      }
      .editor-root li.list-item {
        margin-bottom: 60px;
      }
    `,
  });

  await editor.load('tree-complex');

  const editorRoot = editorLocator(page);
  const scrollContainer = editorRoot.locator('.editor-input').first();
  const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
  const note7 = editorRoot.locator('li.list-item', { hasText: 'note7' }).first();

  const overflowY = await scrollContainer.evaluate((element) => globalThis.getComputedStyle(element).overflowY);
  expect(['auto', 'scroll']).toContain(overflowY);

  await expect(note7).toBeVisible();
  await scrollContainer.evaluate((element) => {
    element.scrollTop = 0;
  });

  const requiresScroll = await note7.evaluate((element) => {
    const container = element.closest('.editor-input');
    if (!container) {
      return false;
    }
    const noteRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return noteRect.bottom > containerRect.bottom + 1;
  });
  expect(requiresScroll).toBe(true);

  const metrics = await getBulletMetrics(note1);
  await page.mouse.click(metrics.x, metrics.y);
  await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}\?zoom=note1$`));

  await expect(note7).toBeHidden();

  const isScrollable = await scrollContainer.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(isScrollable).toBe(true);

  const startScrollTop = await scrollContainer.evaluate((element) => element.scrollTop);
  expect(startScrollTop).toBe(0);

  await page.evaluate(async () => {
    const api = await (__remdoBridgePromise ?? Promise.reject(new Error('remdo bridge is not available')));
    await api.updateNoteText('note7', 'note7!');
  });

  await expect(page).toHaveURL(`/n/${editor.docId}`);
  await expect(note7).toBeVisible();

  await expect.poll(async () => {
    return note7.evaluate((element) => {
      const container = element.closest('.editor-input');
      if (!container) {
        return false;
      }
      const noteRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return noteRect.top >= containerRect.top - 1 && noteRect.bottom <= containerRect.bottom + 1;
    });
  }).toBe(true);
});
