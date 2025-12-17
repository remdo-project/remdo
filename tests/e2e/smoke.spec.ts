import { expect, test } from './editor/_support/fixtures';

test.describe('Editor smoke', () => {
  test('renders shell and supports indent/outdent', async ({ page, editor }) => {
    const input = page.locator('.editor-input');
    await input.click();

    await page.keyboard.type('note1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('note2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('note3');

    await expect(editor).toMatchOutline([{ text: 'note1' }, { text: 'note2' }, { text: 'note3' }]);

    const note3 = page.locator('li.list-item', { hasText: 'note3' }).first();
    await note3.click();
    await page.keyboard.press('Tab');

    await expect(editor).toMatchOutline([{ text: 'note1' }, { text: 'note2', children: [{ text: 'note3' }] }]);

    await page.locator('li.list-item', { hasText: 'note3' }).first().click();
    await page.keyboard.press('Shift+Tab');
    await expect(editor).toMatchOutline([{ text: 'note1' }, { text: 'note2' }, { text: 'note3' }]);
  });

  // The flat fixture coverage now lives under tests/e2e/editor/.
});
