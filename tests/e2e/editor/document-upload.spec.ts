import { Buffer } from 'node:buffer';
import { expect, isolatedTest as test } from '#editor/fixtures';
import { readFixture } from '#tools/fixtures';
import { createUserDocument } from '../_support/documents';
import { ensureReady, waitForSynced } from './_support/bridge';
import { editorLocator, homeView, homeZoomBreadcrumb, openDocumentFromHome } from '#editor/locators';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document upload', () => {
  test('uploads a lexical JSON backup into a newly created document', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Upload Source ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const createdDocId = await captureCreatedDoc(page, async () => {
      await homeZoomBreadcrumb(page).click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await homeView(page).getByRole('button', { name: 'Upload document' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        buffer: Buffer.from(await readFixture('tree-complex')),
        mimeType: 'application/json',
        name: 'tree-complex.json',
      });
    });

    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page).getByRole('button', { name: 'tree-complex', exact: true })).toBeVisible();
  });

  test('keeps the created document and reports invalid uploaded JSON', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Upload Source ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const createdDocId = await captureCreatedDoc(page, async () => {
      await homeZoomBreadcrumb(page).click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await homeView(page).getByRole('button', { name: 'Upload document' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        buffer: Buffer.from('{'),
        mimeType: 'application/json',
        name: 'broken.json',
      });
    });

    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await expect(page.getByRole('alert')).toContainText('Could not upload document');
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page).getByRole('button', { name: 'broken', exact: true })).toBeVisible();
    await homeView(page).getByRole('button', { name: sourceDocument.title, exact: true }).click();
    await openDocumentFromHome(page, 'broken');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
