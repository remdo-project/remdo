import { expect, isolatedTest as test } from '#editor/fixtures';
import { editorLocator, homeView, homeZoomBreadcrumb } from '#editor/locators';
import { waitForSynced } from './_support/bridge';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Home', () => {
  test('opens at its own URL without document controls or a mounted editor', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    await expect(page).toHaveURL('/');
    await expect(homeView(page).getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
    await expect(editorLocator(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Search document' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show documents' })).toHaveCount(0);
    await expect(page).toHaveTitle('Home · RemDo');
  });

  test('opens a listed document at its root and preserves Home in browser history', async ({ page, editor }) => {
    await editor.load('basic');
    const documentPath = createEditorDocumentPath(editor.docId);
    const notePath = createEditorDocumentPath(editor.docId, 'note1');
    await page.goto(notePath);
    await waitForSynced(page);
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');

    // Keyboard activation of the same document starts at its root, not its old zoom.
    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first();
    await row.focus();
    await row.press('Enter');
    await expect(page).toHaveURL(documentPath);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();

    // Zoom changes the document entry, so Back should still return to Home.
    const search = page.getByRole('combobox', { name: 'Search document' });
    await search.fill('note3');
    await search.press('Enter');
    const nextNotePath = createEditorDocumentPath(editor.docId, 'note3');
    await expect(page).toHaveURL(nextNotePath);

    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(homeView(page).getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(notePath);
    await waitForSynced(page);
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await page.goForward();
    await expect(page).toHaveURL('/');
    await expect(homeView(page)).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(nextNotePath);
    await waitForSynced(page);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('creates a document from Home and returns to Home with Back', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    await expect(home.getByRole('button', { name: 'New document', exact: true })).toBeVisible();
    await expect(home.getByRole('button', { name: 'Upload document' })).toBeVisible();
    await home.getByRole('button', { name: 'New document', exact: true }).click();
    await expect(page).toHaveURL(/\/n\/[^/_]+$/);
    await waitForSynced(page);
    await expect(editorLocator(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(homeView(page)).toBeVisible();
  });

  test('leaves document search when navigating Home and reopening the document', async ({ page, editor }) => {
    await editor.load('basic');
    await page.getByRole('combobox', { name: 'Search document' }).fill('note2');
    await expect(page.getByRole('listbox', { name: 'Search results' })).toBeVisible();
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');
    await homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().click();
    await waitForSynced(page);
    await expect(page.getByRole('combobox', { name: 'Search document' })).toHaveValue('');
    await expect(editorLocator(page)).toBeVisible();
  });
});
