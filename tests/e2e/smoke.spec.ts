import { expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';

test.describe('App smoke', () => {
  test('renders shell', async ({ page }) => {
    await page.goto(`/n/${createUniqueNoteId()}`);

    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose document' })).toBeVisible();

    await expect(page.locator('.editor-container').first()).toBeVisible();
    await expect(page.locator('.editor-input').first()).toBeVisible();
  });
});
