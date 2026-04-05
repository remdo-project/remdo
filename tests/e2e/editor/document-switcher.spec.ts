import { expect, test } from '#editor/fixtures';
import { ensureReady, load, waitForSynced } from './_support/bridge';
import { editorLocator } from './_support/locators';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document switcher', () => {
  test('creates a listed document, switches to it, and switches back to main', async ({ page }) => {
    await seedDocument(page, 'main', 'tree-complex');

    await page.goto(createEditorDocumentPath('main'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    const createdDocId = await createListedDocumentFromSwitcher(page);
    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await ensureReady(page, { clear: true });
    await load(page, 'flat');
    await waitForSynced(page);

    const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
    await expect(switcherTrigger).toBeVisible();
    await switcherTrigger.click();
    await page.getByRole('option', { name: 'Main', exact: true }).click();
    await expect(page).toHaveURL(createEditorDocumentPath('main'));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await waitForSynced(page);
    await expect(editorLocator(page).locator('li.list-item', { hasText: 'note7' }).first()).toBeVisible();

    await switcherTrigger.click();
    await page.getByRole('option', { name: 'New Document', exact: true }).first().click();
    await expect(page).toHaveURL(createEditorDocumentPath(createdDocId));
    await editorLocator(page).locator('.editor-input').first().waitFor();
    await waitForSynced(page);
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

    await page.getByRole('option', { name: 'New', exact: true }).click();

    await expect(page).not.toHaveURL(createEditorDocumentPath('main'));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    await switcherTrigger.click();
    await expect(page.getByRole('option')).toHaveCount(initialOptionCount + 1);
    await expect(page.getByRole('option', { name: 'New Document' })).toHaveCount(initialNewDocumentCount + 1);
  });
});

async function seedDocument(page: Parameters<typeof editorLocator>[0], docId: string, fixtureName: string) {
  await page.goto(createEditorDocumentPath(docId));
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });
  await load(page, fixtureName);
  await waitForSynced(page);
}

async function createListedDocumentFromSwitcher(page: Parameters<typeof editorLocator>[0]): Promise<string> {
  const previousUrl = page.url();
  const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
  await switcherTrigger.click();
  await page.getByRole('option', { name: 'New', exact: true }).click();
  await expect(page).not.toHaveURL(previousUrl);
  await editorLocator(page).locator('.editor-input').first().waitFor();
  const match = new URL(page.url()).pathname.match(/\/e2e\/n\/([^/]+)$/);
  if (!match) {
    throw new Error(`Unable to resolve created document id from URL: ${page.url()}`);
  }
  return match[1]!;
}
