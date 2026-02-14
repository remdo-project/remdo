import type { Locator } from '#editor/fixtures';
import type { Page } from '#e2e/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { createEditorDocumentPath, createEditorDocumentPathRegExp } from './_support/routes';

const SCROLL_STYLES = `
  .editor-input {
    max-height: 120px;
    overflow-y: auto;
  }
  .editor-root li.list-item {
    margin-bottom: 60px;
  }
`;

const setupScrollableEditor = async (page: Page) => {
  await page.setViewportSize({ width: 900, height: 320 });
  await page.addStyleTag({ content: SCROLL_STYLES });
};

const getCommonLocators = (page: Page, editor: { docId: string }) => {
  const editorRoot = editorLocator(page);
  return {
    editorRoot,
    scrollContainer: editorRoot.locator('.editor-input').first(),
    note1: editorRoot.locator('li.list-item', { hasText: 'note1' }).first(),
    note7: editorRoot.locator('li.list-item', { hasText: 'note7' }).first(),
    docId: editor.docId,
  };
};

const getBulletMetrics = async (listItem: Locator) => {
  return listItem.evaluate((element: HTMLElement) => {
    const target = element.closest('li.list-item') ?? element;
    const style = globalThis.getComputedStyle(target, '::before');
    const rect = target.getBoundingClientRect();
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
    const left = Number.parseFloat(style.left);
    const baseLeft = rect.left + (Number.isFinite(left) ? left : 0);
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
    return { x: baseLeft + offset + 1, y: lineCenterY };
  });
};

test('auto-zoom scrolls to the edited note', async ({ page, editor }) => {
  await setupScrollableEditor(page);

  await editor.load('tree-complex');

  const { scrollContainer, note1, note7, docId } = getCommonLocators(page, editor);

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
  await expect(page).toHaveURL(createEditorDocumentPathRegExp(docId, 'note1'));

  await expect(note7).toBeHidden();

  const isScrollable = await scrollContainer.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(isScrollable).toBe(true);

  const startScrollTop = await scrollContainer.evaluate((element) => element.scrollTop);
  expect(startScrollTop).toBe(0);

  await page.evaluate(async () => {
    const api = await (__remdoBridgePromise ?? Promise.reject(new Error('remdo bridge is not available')));
    await api.updateNoteText('note7', 'note7!');
  });

  await expect(page).toHaveURL(createEditorDocumentPath(docId));
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

test('auto-zoom keeps the caret note visible after split', async ({ page, editor }) => {
  await setupScrollableEditor(page);

  await editor.load('tree-complex');

  const { note7, docId } = getCommonLocators(page, editor);

  const longText = Array.from(
    { length: 40 },
    () => 'note7 is a long note used to force wrapping so scroll behavior is observable in tests'
  ).join(' ');

  await page.evaluate(async (text) => {
    const api = await (__remdoBridgePromise ?? Promise.reject(new Error('remdo bridge is not available')));
    await api.updateNoteText('note7', text);
  }, longText);

  await expect(note7).toContainText(longText);
  await page.evaluate((id) => {
    globalThis.history.pushState({}, '', `/e2e/n/${id}_note7`);
    globalThis.dispatchEvent(new PopStateEvent('popstate'));
  }, docId);
  await expect(page).toHaveURL(createEditorDocumentPathRegExp(docId, 'note7'));

  const noteIsTall = await note7.evaluate((element) => {
    const container = element.closest('.editor-input');
    if (!container) {
      return false;
    }
    return element.getBoundingClientRect().height > container.getBoundingClientRect().height;
  });
  expect(noteIsTall).toBe(true);

  const splitIndex = Math.max(1, Math.floor(longText.length / 2));
  const expectedSuffix = longText.slice(splitIndex);

  await setCaretAtText(page, 'note7 is a long note used to force wrapping', splitIndex);

  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(createEditorDocumentPath(docId, 'note6'));

  await expect.poll(async () => {
    return page.evaluate((suffix) => {
      const container = document.querySelector('.editor-input');
      if (!container) {
        return false;
      }
      const selection = globalThis.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return false;
      }
      const range = selection.getRangeAt(0);
      const anchor =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement;
      const listItem = anchor?.closest('li.list-item');
      if (!listItem) {
        return false;
      }
      const rect = range.getBoundingClientRect();
      if (rect.height <= 0 && rect.width <= 0) {
        return false;
      }
      const text = listItem.querySelector('[data-lexical-text="true"]')?.textContent ?? '';
      const trimmedText = text.trimStart();
      const trimmedSuffix = suffix.trimStart();
      if (trimmedText !== trimmedSuffix) {
        return false;
      }
      const containerRect = container.getBoundingClientRect();
      return rect.top >= containerRect.top - 1 && rect.bottom <= containerRect.bottom + 1;
    }, expectedSuffix);
  }).toBe(true);
});
