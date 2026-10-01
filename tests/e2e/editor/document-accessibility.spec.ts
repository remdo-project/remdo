import { expect, isolatedTest as test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

test.describe('Document accessibility', () => {
  test('names the outline and its save status for assistive technology', async ({ page, editor }) => {
    await editor.load('basic');

    await expect(page.getByRole('textbox', { name: 'Outline' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Saved to server/u })).toBeVisible();
  });

  test('keeps the pointer-only note controls out of the tab order', async ({ page, editor }) => {
    await editor.load('basic');
    await editorLocator(page).locator('[data-lexical-text="true"]', { hasText: 'note1' }).first().hover();

    await expect(editorLocator(page).locator('.note-controls__button--menu')).toHaveAttribute('tabindex', '-1');
  });
});
