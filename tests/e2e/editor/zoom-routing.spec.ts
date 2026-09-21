import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { withPageGuards } from '#e2e/fixtures';
import { clearZoom, editorLocator, homeZoomBreadcrumb, noteRow, zoomBreadcrumbs } from '#editor/locators';
import { load, waitForSynced } from './_support/bridge';
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

  test('clears zoom route when re-selecting the current document in the picker', async ({ page, editor }) => {
    await page.goto(createEditorDocumentPath(editor.docId, 'note1'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await editor.load('basic');

    await clearZoom(page);
    await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
  });

  test('shows the current location through nested zoom and clears it at the document root', async ({ page, editor }) => {
    await editor.load('basic');

    const editorRoot = editorLocator(page);
    const note1 = editorRoot.locator('li.list-item', { hasText: 'note1' }).first();
    const metrics = await getBulletMetrics(note1);
    await page.mouse.click(metrics.x, metrics.y);

    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note1'));
    const breadcrumbs = zoomBreadcrumbs(page);
    const current = breadcrumbs.locator('[aria-current="page"]');
    await expect(current).toHaveText('note1');
    await expect(breadcrumbs.locator('[data-zoom-crumb="ancestor"]')).toHaveCount(0);

    const note2 = editorRoot.locator('li.list-item:not(.list-nested-item)', { hasText: 'note2' }).first();
    const childMetrics = await getBulletMetrics(note2);
    await page.mouse.click(childMetrics.x, childMetrics.y);
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note2'));
    await expect(current).toHaveText('note2');
    const parent = breadcrumbs.getByRole('button', { name: 'note1', exact: true });
    await parent.focus();
    await parent.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Search document' })).toBeFocused();
    await parent.click();
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note1'));
    await expect(current).toHaveText('note1');

    await clearZoom(page);
    await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
    await expect(current).toHaveCount(0);
    await expect(breadcrumbs.locator('[data-zoom-crumb="ancestor"]')).toHaveCount(0);
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

for (const target of ['note7', 'missingNote'] as const) {
  test(`resolves uncached zoom target ${target} after a failed refresh and reconnection`, async ({
    page, editor, newEditorContext,
  }, testInfo) => {
    await editor.load('flat');
    await waitForSynced(page);
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');
    const peerContext = await newEditorContext();
    try {
      const peer = await peerContext.newPage();
      await withPageGuards(peer, async () => {
        await peer.goto(createEditorDocumentPath(editor.docId));
        await load(peer, 'tree-complex');
        await waitForSynced(peer);
      }, testInfo);
    } finally {
      await peerContext.close();
    }

    let releaseConnection!: () => void;
    const connectionGate = new Promise<void>((resolve) => { releaseConnection = resolve; });
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
    let failConnection = true;
    await page.routeWebSocket('**/collaboration', (socket) => {
      const server = socket.connectToServer();
      const interrupt = failConnection;
      let closed = false;
      server.onMessage(async (message) => {
        await connectionGate;
        if (interrupt) {
          if (closed) return;
          closed = true;
          await socket.close({ code: 1000, reason: 'test interruption' });
          await server.close();
        } else {
          await retryGate;
          socket.send(message);
        }
      });
    });
    try {
      await page.goto(createEditorDocumentPath(editor.docId, target));
      await expect(editorLocator(page).locator('.editor-input')).toBeEditable();
      await expect(noteRow(page, 'note1')).toBeVisible();
      await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, target));
      releaseConnection();
      await expect(page.getByLabel(/Server disconnected/)).toBeVisible();
      failConnection = false;
      await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, target));
      releaseRetry();
      await page.evaluate(() => globalThis.dispatchEvent(new Event('online')));
      await waitForSynced(page);
      if (target === 'note7') {
        await expect(zoomBreadcrumbs(page).locator('[aria-current="page"]')).toHaveText('note7');
        await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, 'note7'));
      } else {
        await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
        await expect(noteRow(page, 'note7')).toBeVisible();
      }
    } finally {
      failConnection = false;
      releaseConnection();
      releaseRetry();
    }
  });
}
