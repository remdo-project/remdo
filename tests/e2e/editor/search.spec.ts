import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';
import { createEditorDocumentPathRegExp } from './_support/routes';

async function readHighlightStyle(locator: Locator) {
  return locator.evaluate((element: HTMLElement) => {
    const style = globalThis.getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
    };
  });
}

test.describe('Search', () => {
  test('keeps a visible active highlight in flat results', async ({ page, editor }) => {
    await editor.load('flat');

    const searchInput = page.getByRole('combobox', { name: 'Search document' });
    await searchInput.click();
    await searchInput.fill('note');

    const activeResult = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]')
      .locator('[data-search-result-item][data-search-result-active="true"]')
      .first();
    await expect(activeResult).toBeVisible();
    await expect(activeResult).toContainText('note1');

    const style = await readHighlightStyle(activeResult);
    expect(style.boxShadow === 'none' && style.backgroundColor === 'rgba(0, 0, 0, 0)').toBe(false);
  });

  test('anchors the first result to the editor first-note text on open', async ({ page, editor }) => {
    await editor.load('tree');

    const shell = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]');

    // Editor's first note text position, before search opens.
    const firstNoteText = editorLocator(page).locator('.list-item').first();
    await expect(firstNoteText).toBeVisible();
    const editorRect = await firstNoteText.evaluate((el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });

    // Open search with an empty query so the first note is the first result.
    const searchInput = page.getByRole('combobox', { name: 'Search document' });
    await searchInput.click();
    await searchInput.fill('');

    const firstResultText = shell.locator('[data-search-result-match]').first();
    await expect(firstResultText).toBeVisible();
    const resultRect = await firstResultText.evaluate((el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });

    // The first result's text must land on the editor's note-text column and row,
    // so opening search does not visibly shift the first note (allow 1px rounding).
    expect(Math.abs(resultRect.left - editorRect.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(resultRect.top - editorRect.top)).toBeLessThanOrEqual(1);
  });

  test('matches notes by path tokens and zooms the highlighted result on Enter', async ({ page, editor }) => {
    // tree fixture: note1 and note2 are top-level siblings; note3 is nested under
    // note2, so note3's path is [note2, note3].
    await editor.load('tree');

    const shell = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]');
    const resultItems = shell.locator('[data-search-result-item]');
    const searchInput = page.getByRole('combobox', { name: 'Search document' });

    await searchInput.click();

    // An ancestor token plus a leaf token matches the nested note: 'note2' hits
    // note3's ancestor and 'note3' hits the note itself.
    await searchInput.fill('note2 note3');
    await expect(resultItems).toHaveCount(1);
    await expect(resultItems.first()).toContainText('note3');

    // The leaf-first guard keeps an ancestor-only token from pulling in the
    // subtree: 'note2' matches note2 itself but not its descendant note3.
    await searchInput.fill('note2');
    await expect(resultItems).toHaveCount(1);
    await expect(resultItems.first()).toContainText('note2');

    // Enter zooms the highlighted (first) result and exits search mode.
    await searchInput.fill('note3');
    const activeResult = resultItems.first();
    await expect(activeResult).toContainText('note3');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note3'));
  });

  test('zooms the clicked result and closes search', async ({ page, editor }) => {
    await editor.load('tree');

    const shell = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]');
    const resultItems = shell.locator('[data-search-result-item]');
    const searchInput = page.getByRole('combobox', { name: 'Search document' });

    await searchInput.click();
    await searchInput.fill('note3');
    await expect(resultItems).toHaveCount(1);
    await expect(resultItems.first()).toContainText('note3');

    // A real mouse click on the result row must zoom it and end Search Mode,
    // exactly like accepting it with Enter.
    await resultItems.first().click();

    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note3'));
    await expect(shell.locator('[data-testid="document-search-results"]')).toHaveCount(0);
  });

  test('hovering a result makes it the active row', async ({ page, editor }) => {
    await editor.load('tree');

    const shell = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]');
    const searchInput = page.getByRole('combobox', { name: 'Search document' });

    await searchInput.click();
    await searchInput.fill('note');

    const rows = shell.locator('[data-search-result-item]');
    // The first result is active on open.
    await expect(rows.first()).toHaveAttribute('data-search-result-active', 'true');

    // Hovering a different row moves the active highlight to it, and search stays
    // open (hover must not blur the input).
    const second = rows.nth(1);
    await second.hover();
    await expect(second).toHaveAttribute('data-search-result-active', 'true');
    await expect(rows.first()).not.toHaveAttribute('data-search-result-active', 'true');
    await expect(shell.locator('[data-testid="document-search-results"]')).toHaveCount(1);
  });
});
