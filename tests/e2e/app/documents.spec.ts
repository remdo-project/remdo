import { expect, test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { HTTP_STATUS } from '#lib/http/status';

test.describe('Documents API', () => {
  test('does not issue document tokens for unregistered ids', async ({ page }) => {
    const docId = createUniqueNoteId();

    const response = await page.request.post(`/api/documents/${docId}/token`);

    expect(response.status()).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(response.json()).resolves.toEqual({ error: 'Document not found.' });
  });
});
