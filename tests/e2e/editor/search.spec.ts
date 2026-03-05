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

  test('supports slash navigation with inline completion acceptance and Enter zoom', async ({ page, editor }) => {
    await editor.load('tree-complex');

    const searchInput = page.getByRole('combobox', { name: 'Search document' });
    const activeResult = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]')
      .locator('[data-search-result-item][data-search-result-active="true"]')
      .first();

    await searchInput.click();
    await searchInput.fill('/');
    await expect(activeResult).toContainText('note1');

    await page.keyboard.press('ArrowDown');
    await expect(activeResult).toContainText('note5');
    await expect(searchInput).toHaveValue('/');

    await page.keyboard.press('ArrowUp');
    await expect(activeResult).toContainText('note1');
    await expect(searchInput).toHaveValue('/');

    await searchInput.fill('/no');
    const inlineCompletion = page.getByTestId('document-search-inline-completion');
    await expect(inlineCompletion).toHaveAttribute('data-inline-completion-text', 'te1');

    await page.keyboard.press('ArrowRight');
    await expect(searchInput).toHaveValue('/note1');

    await page.keyboard.press('ArrowRight');
    await expect(searchInput).toHaveValue('/note1/');
    await expect(activeResult).toContainText('note2');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(createEditorDocumentPathRegExp(editor.docId, 'note2'));
  });
});
