import type { Locator } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

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

    const searchInput = page.getByRole('textbox', { name: 'Search document' });
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
});
