import { Buffer } from 'node:buffer';
import { expect, test } from '#editor/fixtures';
import { readFixture } from '#tools/fixtures';
import { createUserDocument } from '../_support/documents';
import { ensureReady, load, waitForSynced } from './_support/bridge';
import { chooseDocument, documentPicker, documentPickerButton, editorLocator, homeView, homeZoomBreadcrumb } from '#editor/locators';
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

  test('keeps the document picker filter editable after the first character', async ({ page }) => {
    const sourceDocument = await createUserDocument(page, `Picker Filter ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    await documentPickerButton(page).click();
    const picker = documentPicker(page);
    await expect(picker).toBeFocused();

    await picker.pressSequentially('ba');
    await expect(picker).toHaveValue('ba');
    await picker.press('Backspace');
    await expect(picker).toHaveValue('b');
    await expect(picker).toBeFocused();
  });

  test('creates a listed document, switches to it, and switches back to the source document', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
    await seedDocument(page, sourceDocument.id, 'tree-complex');

    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    const createdDocId = await captureCreatedDoc(page, async () => {
      await homeZoomBreadcrumb(page).click();
      await homeView(page).getByRole('button', { name: 'New document' }).click();
    });
    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await ensureReady(page);
    await load(page, 'flat');
    await waitForSynced(page);

    await chooseDocument(page, sourceDocument.title);
    await expect(page).toHaveURL(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    await chooseDocument(page, 'New Document');
    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' })).toHaveCount(0);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
  });

  test('creates a new document from the switcher and lists it', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
    await page.goto(createEditorDocumentPath(sourceDocument.id));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    await documentPickerButton(page).click();
    const initialNewDocumentCount = await page.getByRole('option', { name: 'New Document' }).count();
    await page.keyboard.press('Escape');

    await captureCreatedDoc(page, async () => {
      await homeZoomBreadcrumb(page).click();
      await homeView(page).getByRole('button', { name: 'New document' }).click();
    });

    await documentPickerButton(page).click();
    await expect(page.getByRole('option', { name: 'New Document' })).toHaveCount(initialNewDocumentCount + 1);
  });

  test('uploads a lexical JSON backup into a newly created document', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
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

    await documentPickerButton(page).click();
    await expect(page.getByRole('option', { name: 'tree-complex', exact: true })).toBeVisible();
  });

  test('keeps the created document and reports invalid uploaded JSON', async ({ page, captureCreatedDoc }) => {
    const sourceDocument = await createUserDocument(page, `Switcher Source ${Date.now()}`);
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
    await documentPickerButton(page).click();
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
