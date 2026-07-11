import { Buffer } from 'node:buffer';
import { expect, test } from '#editor/fixtures';
import { readFixture } from '#tools/fixtures';
import { cleanupCollabDoc } from '#tests-common/runtime-scope';
import { createUserDocument } from '../_support/documents';
import { ensureReady, load, waitForSynced } from './_support/bridge';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document switcher', () => {
  test('stacks document and search controls without horizontal overflow on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await editorLocator(page).locator('.editor-input').first().waitFor();

    const shell = editorLocator(page)
      .locator('xpath=ancestor-or-self::*[contains(@class,"document-editor-shell")]');
    const breadcrumbs = shell.locator('.document-header-breadcrumbs');
    const actions = shell.locator('.document-header-actions');
    await expect(breadcrumbs).toBeVisible();
    await expect(actions).toBeVisible();

    const [breadcrumbsBox, actionsBox] = await Promise.all([
      breadcrumbs.boundingBox(),
      actions.boundingBox(),
    ]);
    expect(breadcrumbsBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(actionsBox!.y).toBeGreaterThanOrEqual(breadcrumbsBox!.y + breadcrumbsBox!.height);

    const overflow = await page.evaluate(() => ({
      header: document.querySelector<HTMLElement>('.document-header')!.scrollWidth -
        document.querySelector<HTMLElement>('.document-header')!.clientWidth,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow).toEqual({ header: 0, page: 0 });
  });

  test('creates a listed document, switches to it, and switches back to the source document', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
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

  test('creates a new document from the switcher and lists it', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
    await switcherTrigger.click();

    const initialNewDocumentCount = await page.getByRole('option', { name: 'New Document' }).count();

    await captureCreatedDoc(page, async () => {
      await page.getByRole('option', { name: 'New', exact: true }).click();
    });

    await switcherTrigger.click();
    await expect(page.getByRole('option', { name: 'New Document' })).toHaveCount(initialNewDocumentCount + 1);
  });

  test('uploads a lexical JSON backup into a newly created document', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const createdDocId = await captureCreatedDoc(page, async () => {
      await page.getByRole('button', { name: 'Choose document' }).click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('option', { name: 'Upload', exact: true }).click();
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

    await page.getByRole('button', { name: 'Choose document' }).click();
    await expect(page.getByRole('option', { name: 'tree-complex', exact: true })).toBeVisible();
  });

  test('keeps the created document and reports invalid uploaded JSON', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const createdDocId = await captureCreatedDoc(page, async () => {
      await page.getByRole('button', { name: 'Choose document' }).click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('option', { name: 'Upload', exact: true }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        buffer: Buffer.from('{'),
        mimeType: 'application/json',
        name: 'broken.json',
      });
    });

    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await expect(page.getByRole('alert')).toContainText('Could not upload document');
    await page.getByRole('button', { name: 'Choose document' }).click();
    await expect(page.getByRole('option', { name: 'broken', exact: true })).toBeVisible();
  });
});

async function seedDocument(page: Parameters<typeof editorLocator>[0], docId: string, fixtureName: string) {
  await page.goto(createEditorDocumentPath(docId));
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });
  await load(page, fixtureName);
  await waitForSynced(page);
}
