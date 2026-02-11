import { expect, test } from '#e2e/fixtures';
import { config } from '#config';
import { normalizeNoteId } from '#lib/editor/note-ids';

const defaultDocId = (() => {
  const normalized = normalizeNoteId(config.env.COLLAB_DOCUMENT_ID);
  if (normalized) {
    return normalized;
  }
  throw new Error('E2E smoke requires a valid COLLAB_DOCUMENT_ID.');
})();

test.describe('App smoke', () => {
  test('renders shell', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();

    const project = page.getByRole('link', { name: 'Project' });
    await expect(project).toBeVisible();
    await expect(project).toHaveAttribute('href', `/n/${defaultDocId}`);

    await expect(page.locator('.editor-container').first()).toBeVisible();
    await expect(page.locator('.editor-input').first()).toBeVisible();
  });
});
