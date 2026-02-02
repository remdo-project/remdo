import { expect, test } from '#e2e/fixtures';
import { config } from '#config';

const defaultDocId = config.env.COLLAB_DOCUMENT_ID.trim() || 'project';

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
