import { expect, test } from '#editor/fixtures';
import { ensureReady, load, waitForSynced } from './_support/bridge';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document switcher', () => {
  test('switches between hardcoded documents and updates visible outline', async ({ page }) => {
    const seedDocument = async (docId: string, fixtureName: string) => {
      await page.goto(createEditorDocumentPath(docId));
      await editorLocator(page).locator('.editor-input').first().waitFor();
      await ensureReady(page, { clear: true });
      await load(page, fixtureName);
      await waitForSynced(page);
    };

    await seedDocument('main', 'tree-complex');
    await seedDocument('flat', 'flat');

    await page.goto(createEditorDocumentPath('main'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
    await expect(switcherTrigger).toBeVisible();
    await switcherTrigger.click();
    await page.getByRole('option', { name: 'Flat' }).click();
    await expect(page).toHaveURL(createEditorDocumentPath('flat'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' })).toHaveCount(0);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note3' }).first()).toBeVisible();
  });

  test('creates a new document from the switcher and lists it', async ({ page }) => {
    await page.goto(createEditorDocumentPath('main'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await ensureReady(page);

    const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
    await switcherTrigger.click();

    const options = page.getByRole('option');
    const initialOptionCount = await options.count();
    const initialNewDocumentCount = await page.getByRole('option', { name: 'New Document' }).count();

    await page.getByRole('option', { name: 'New' }).click();

    await expect(page).not.toHaveURL(createEditorDocumentPath('main'));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    await switcherTrigger.click();
    await expect(page.getByRole('option')).toHaveCount(initialOptionCount + 1);
    await expect(page.getByRole('option', { name: 'New Document' })).toHaveCount(initialNewDocumentCount + 1);
  });
});
