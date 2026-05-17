import { expect, test } from '#editor/fixtures';
import type { Page } from '#editor/fixtures';
import { cleanupCollabDoc } from '#tests-common/runtime-scope';
import { ensureReady, load, waitForSynced } from './_support/bridge';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document switcher', () => {
  test('creates a listed document, switches to it, and switches back to the source document', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createListedDocument(page, `Switcher Source ${Date.now()}`);
    try {
      await seedDocument(page, sourceDocument.id, 'tree-complex');

      await page.goto(createEditorDocumentPath(sourceDocument.id));
      await editorLocator(page).locator('.editor-input').first().waitFor();
      await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

      const createdDocId = await captureCreatedDoc(page, async () => {
        const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
        await switcherTrigger.click();
        await page.getByRole('option', { name: 'New', exact: true }).click();
      });
      await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
      await ensureReady(page);
      await load(page, 'flat');
      await waitForSynced(page);

      const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
      await expect(switcherTrigger).toBeVisible();
      await switcherTrigger.click();
      await page.getByRole('option', { name: sourceDocument.title, exact: true }).click();
      await expect(page).toHaveURL(createEditorDocumentPath(sourceDocument.id));
      await editorLocator(page).locator('.editor-input').first().waitFor();
      await ensureReady(page);
      await waitForSynced(page);
      await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

      await switcherTrigger.click();
      await page.getByRole('option', { name: 'New Document', exact: true }).first().click();
      await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
      await editorLocator(page).locator('.editor-input').first().waitFor();
      await ensureReady(page);
      await waitForSynced(page);
      await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' })).toHaveCount(0);
      await expect(editorLocator(page).locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
    } finally {
      await cleanupCollabDoc(sourceDocument.id);
    }
  });

  test('creates a new document from the switcher and lists it', async ({ page, allocateEditorDocId, captureCreatedDoc }) => {
    await page.goto(createEditorDocumentPath(allocateEditorDocId()));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
    await switcherTrigger.click();

    const options = page.getByRole('option');
    const initialOptionCount = await options.count();
    const initialNewDocumentCount = await page.getByRole('option', { name: 'New Document' }).count();

    await captureCreatedDoc(page, async () => {
      await page.getByRole('option', { name: 'New', exact: true }).click();
    });

    await switcherTrigger.click();
    await expect(page.getByRole('option')).toHaveCount(initialOptionCount + 1);
    await expect(page.getByRole('option', { name: 'New Document' })).toHaveCount(initialNewDocumentCount + 1);
  });
});

async function createListedDocument(page: Page, title: string): Promise<{ id: string; title: string }> {
  const response = await page.request.post('/api/profile/documents', {
    data: { title },
  });
  await expect(response).toBeOK();
  return response.json() as Promise<{ id: string; title: string }>;
}

async function seedDocument(page: Parameters<typeof editorLocator>[0], docId: string, fixtureName: string) {
  await page.goto(createEditorDocumentPath(docId));
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });
  await load(page, fixtureName);
  await waitForSynced(page);
}
