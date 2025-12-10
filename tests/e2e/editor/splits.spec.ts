import { expect, test } from '../_support/fixtures';

test.describe('Editor (focused)', () => {
  test('Enter at end splits into new sibling', async ({ page, editor }) => {
    await editor.load('flat');

    const input = page.locator('.editor-input');
    await input.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('note4');

    const items = page.locator('li.list-item');
    await expect(items).toHaveCount(4);
    await expect(items.nth(3)).toContainText('note4');
  });
});
