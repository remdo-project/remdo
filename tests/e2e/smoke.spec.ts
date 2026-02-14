import { expect, test } from '#e2e/fixtures';
import { config } from '#config';
import { createUniqueNoteId, normalizeNoteIdOrThrow } from '#lib/editor/note-ids';

const defaultDocId = normalizeNoteIdOrThrow(
  config.env.COLLAB_DOCUMENT_ID,
  'E2E smoke requires a valid COLLAB_DOCUMENT_ID.',
);

test.describe('App smoke', () => {
  test('renders shell', async ({ page }) => {
    await page.goto(`/n/${createUniqueNoteId()}`);

    await expect(page.getByRole('link', { name: 'RemDo' })).toBeVisible();

    const project = page.getByRole('link', { name: 'Project' });
    await expect(project).toBeVisible();
    await expect(project).toHaveAttribute('href', `/n/${defaultDocId}`);

    await expect(page.locator('.editor-container').first()).toBeVisible();
    await expect(page.locator('.editor-input').first()).toBeVisible();
  });
});
