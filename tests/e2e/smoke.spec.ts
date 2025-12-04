import { expect, test, waitForAppReady } from './_support/fixtures';

test.describe('Editor smoke', () => {
  test('renders shell and supports indent/outdent', async ({ page }) => {
    const docId = `playwright-smoke-${Date.now()}`;
    await waitForAppReady(page, docId);

    const editor = page.locator('.editor-input');
    await editor.click();

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

    //test
    await expect(page.locator('li.list-item', { hasText: 'note1' })).not.toBeVisible();
    await expect(page.locator('li.list-item', { hasText: 'note1' })).toBeVisible();
    await expect(page.locator('li.list-item', { hasText: 'note3' })).toBeVisible();
  });
});
