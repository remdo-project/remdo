import { test } from '#e2e/fixtures';
import { createUniqueNoteId } from '#domain/notes/ids';
import { expectCollaborationDenied } from '../_support/documents';

test('denies collaboration access for an unregistered document', async ({ page }) => {
  await page.goto('/');
  await expectCollaborationDenied(page, createUniqueNoteId());
});
