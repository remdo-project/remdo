import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { documentZoomBreadcrumb, editorLocator, zoomBreadcrumbs } from '#editor/locators';
import { waitForSynced } from './_support/bridge';
import { createEditorDocumentPath, createEditorDocumentPathRegExp } from './_support/routes';

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
  test('adds zoom route on bullet click', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();

    const metrics = await getBulletMetrics(note1);
    await page.mouse.click(metrics.x, metrics.y);
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note1'));
  });

  test('clears zoom route when clicking document breadcrumb', async ({ page, editor }) => {
    await page.goto(createEditorDocumentPath(editor.docId, 'note1'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await editor.load('basic');

    await documentZoomBreadcrumb(page).click();
    await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
  });

  test('clears breadcrumb path when zoom is cleared', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
    const metrics = await getBulletMetrics(note1);
    await page.mouse.click(metrics.x, metrics.y);

    // The zoom root is the view title, not a crumb; a top-level zoom leaves only
    // the document crumb and no ancestor crumbs.
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note1'));
    const breadcrumbs = zoomBreadcrumbs(page);
    await expect(breadcrumbs.locator('[data-zoom-crumb="ancestor"]')).toHaveCount(0);

    await documentZoomBreadcrumb(page).click();
    await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
  });

  test('invalid zoom route resets to document URL', async ({ page, editor }) => {
    await page.goto(createEditorDocumentPath(editor.docId, 'missingNote'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await waitForSynced(page);

    await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
    await expect(editorLocator(page).locator('li.list-item').first()).toBeVisible();
  });

  test('keeps zoom route on initial load', async ({ page, editor }) => {
    await editor.load('flat');
    await waitForSynced(page);

    await page.goto(createEditorDocumentPath(editor.docId, 'note1'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note1'));
    await waitForSynced(page);
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note1'));
  });
});
