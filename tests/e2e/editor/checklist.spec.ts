import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator, noteRow, setCaretAtText } from '#editor/locators';
import { createEditorDocumentPathRegExp } from './_support/routes';

const getPseudoMetrics = async (listItem: Locator, pseudo: '::before' | '::after') => {
  return listItem.evaluate((element, pseudoSelector) => {
    const style = globalThis.getComputedStyle(element, pseudoSelector);
    const rect = element.getBoundingClientRect();
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
    }
    const left = Number.parseFloat(style.left);
    const top = Number.parseFloat(style.top);
    const baseLeft = rect.left + (Number.isFinite(left) ? left : 0);
    const baseTop = rect.top + (Number.isFinite(top) ? top : 0);
    return {
      x: baseLeft + width / 2,
      y: baseTop + height / 2,
      offsetX: baseLeft + width / 2 - rect.left,
      offsetY: baseTop + height / 2 - rect.top,
    };
  }, pseudo);
};

const clickMarker = async (listItem: Locator, pseudo: '::before' | '::after') => {
  const metrics = await getPseudoMetrics(listItem, pseudo);
  expect(metrics).not.toBeNull();
  if (!metrics) {
    return;
  }
  await listItem.evaluate(
    (element, point) => {
      const options = {
        bubbles: true,
        clientX: point.x,
        clientY: point.y,
      };
      element.dispatchEvent(new PointerEvent('pointerdown', options));
      element.dispatchEvent(new PointerEvent('pointerup', options));
      element.dispatchEvent(new MouseEvent('click', options));
    },
    { x: metrics.x, y: metrics.y }
  );
};

test.describe('Checklist markers', () => {
  test('checkbox toggles when clicking the checkbox marker', async ({ page, editor }) => {
    await editor.load('tree-list-types');

    const childItem = editorLocator(page)
      .locator('li.list-item:not(.list-nested-item)')
      .filter({ hasText: 'note4' })
      .first();
    await expect(childItem).toHaveCount(1);
    await expect(childItem).toHaveAttribute('role', 'checkbox');
    await expect(childItem).toHaveAttribute('aria-checked', 'false');

    await clickMarker(childItem, '::after');
    await expect(childItem).toHaveAttribute('aria-checked', 'true');
    await expect(childItem).toHaveClass(/list-item-checked/);
  });

  test('bullet click zooms without toggling the checkbox', async ({ page, editor }) => {
    await editor.load('tree-list-types');

    const childItem = editorLocator(page)
      .locator('li.list-item:not(.list-nested-item)')
      .filter({ hasText: 'note4' })
      .first();
    await expect(childItem).toHaveCount(1);
    await expect(childItem).toHaveAttribute('role', 'checkbox');
    await expect(childItem).toHaveAttribute('aria-checked', 'false');

    await clickMarker(childItem, '::before');
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note4'));

    const zoomedItem = editorLocator(page)
      .locator('li.list-item:not(.list-nested-item)', { hasText: 'note4' })
      .first();
    await expect(zoomedItem).toHaveAttribute('aria-checked', 'false');
  });

  test('checkbox marker click inside a structural selection toggles the selected range', async ({
    page,
    editor,
  }) => {
    await editor.load('tree-list-types');

    const note3 = noteRow(page, 'note3');
    const note4 = noteRow(page, 'note4');

    await setCaretAtText(page, 'note3');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const input = editorLocator(page).locator('.editor-input');
    await expect(input).toHaveClass(/editor-input--structural/);

    await clickMarker(note4, '::after');

    // The range covers note3 and note4, so the click toggles both rather than
    // only the clicked note.
    await expect(note4).toHaveAttribute('aria-checked', 'true');
    await expect(note3).toHaveAttribute('data-note-checked', 'true');
  });

  test('checkbox marker click outside a structural selection toggles only that note', async ({
    page,
    editor,
  }) => {
    await editor.load('tree-list-types');

    const note1 = noteRow(page, 'note1');
    const note4 = noteRow(page, 'note4');

    await setCaretAtText(page, 'note1');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const input = editorLocator(page).locator('.editor-input');
    await expect(input).toHaveClass(/editor-input--structural/);

    await clickMarker(note4, '::after');

    await expect(note4).toHaveAttribute('aria-checked', 'true');
    await expect(note1).not.toHaveAttribute('data-note-checked', 'true');
  });
});
