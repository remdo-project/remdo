import { expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';

test.describe('App smoke', () => {
  test('renders shell', async ({ page }) => {
    await page.goto(`/n/${createUniqueNoteId()}`);

    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();

    const project = page.getByRole('link', { name: 'Project' });
    await expect(project).toBeVisible();
    await expect(project).toHaveAttribute('href', `/n/project`);

    await expect(page.locator('.editor-container').first()).toBeVisible();
    await expect(page.locator('.editor-input').first()).toBeVisible();
  });
});
