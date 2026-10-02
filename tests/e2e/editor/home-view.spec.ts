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

  test('places the document actions beside the heading above 56px document rows', async ({ page, editor }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    const [heading, upload, create, row] = [
      await home.getByRole('heading', { name: 'Home', level: 1 }).boundingBox(),
      await home.getByRole('button', { name: 'Upload document', exact: true }).boundingBox(),
      await home.getByRole('button', { name: 'New document', exact: true }).boundingBox(),
      await home.getByRole('listitem').first().boundingBox(),
    ];

    expect(upload!.x).toBeGreaterThan(heading!.x + heading!.width);
    expect(create!.x).toBeGreaterThan(upload!.x + upload!.width);
    expect(upload!.y + upload!.height / 2).toBeCloseTo(heading!.y + heading!.height / 2, 0);
    expect(row!.height).toBe(56);
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
    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`);
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
    const dialog = page.getByRole('dialog', { name: 'New document' });
    const input = dialog.getByRole('textbox', { name: 'Document name' });
    await expect(input).toBeFocused();
    await expect(page).toHaveURL('/');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/n\/[^/_]+$/);
    await waitForSynced(page);
    await expect(editorLocator(page)).toBeVisible();
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(homeView(page)).toBeVisible();
  });

  test('cancels a selected suggestion, then replaces it with a name before creating', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    const home = homeView(page);
    await expect(home.locator(`[data-home-document-ref="${editor.docId}"]`)).toBeVisible();
    const initialCount = await home.getByRole('listitem').count();
    const trigger = home.getByRole('button', { name: 'New document', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'New document' });
    const input = dialog.getByRole('textbox', { name: 'Document name' });
    await expect(input).toBeFocused();
    const suggestion = await input.inputValue();
    expect(await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd]))
      .toEqual([0, suggestion.length]);
    await input.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(home.getByRole('listitem')).toHaveCount(initialCount);

    await trigger.click();
    await input.pressSequentially('Named before creation');
    await expect(input).toHaveValue('Named before creation');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/n\/[^/_]+$/u);
    await waitForSynced(page);
    await expect(page.getByRole('heading', { name: 'Named before creation', exact: true })).toBeVisible();
    await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
    await homeZoomBreadcrumb(page).click();
    await expect(home.getByRole('button', { name: 'Named before creation', exact: true })).toBeVisible();
  });

  test('leaves document search when navigating Home and reopening the document', async ({ page, editor }) => {
    await editor.load('basic');
    await page.getByRole('combobox', { name: 'Search document' }).fill('note2');
    await expect(page.getByRole('listbox', { name: 'Search results' })).toBeVisible();
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');
    await homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).click();
    await waitForSynced(page);
    await expect(page.getByRole('combobox', { name: 'Search document' })).toHaveValue('');
    await expect(editorLocator(page)).toBeVisible();
  });
});
