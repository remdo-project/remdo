import { expect, test } from './editor/_support/fixtures';

test.describe('Editor smoke', () => {
  test('renders shell and supports indent/outdent', async ({ page, editor: _editor }) => {
    const input = page.locator('.editor-input');
    await input.click();

    await page.keyboard.type('note1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('note2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('note3');

    const note3 = page.locator('li.list-item', { hasText: 'note3' }).first();
    await note3.click();
    await page.keyboard.press('Tab');

    const nestedNote3 = page.locator('li.list-nested-item', { hasText: 'note3' });
    await expect(nestedNote3).toBeVisible();

    await nestedNote3.click();
    await page.keyboard.press('Shift+Tab');
    await expect(nestedNote3).toHaveCount(0);

    await expect(page.locator('li.list-item', { hasText: 'note1' })).toBeVisible();
    await expect(page.locator('li.list-item', { hasText: 'note3' })).toBeVisible();
  });

  // The flat fixture coverage now lives under tests/e2e/editor/.
});
