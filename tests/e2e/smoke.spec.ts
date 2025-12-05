import { expect, test, waitForAppReady } from './_support/fixtures';
import { load } from './_support/bridge';

test.describe('Editor smoke', () => {
  test.beforeEach(async ({ page, testDocId }) => {
    await waitForAppReady(page, testDocId);
  });

  test('renders shell and supports indent/outdent', async ({ page }) => {
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

    await expect(page.locator('li.list-item', { hasText: 'note1' })).toBeVisible();
    await expect(page.locator('li.list-item', { hasText: 'note3' })).toBeVisible();
  });

  test('loads flat fixture and shows expected notes', async ({ page }) => {
    await load(page, 'flat');

    const items = page.locator('li.list-item >> span');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('note1');
    await expect(items.nth(1)).toHaveText('note2');
    await expect(items.nth(2)).toHaveText('note3');
  });
});
