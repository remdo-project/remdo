import { expect, test } from '#editor/fixtures';
import { editorLocator, homeView, homeZoomBreadcrumb } from '#editor/locators';
import { waitForSynced } from './_support/bridge';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Home view', () => {
  test('the Home crumb opens Home and hides the editor', async ({ page, editor }) => {
    await editor.load('basic');

    await expect(editorLocator(page)).toBeVisible();
    await expect(homeView(page)).toHaveCount(0);

    await homeZoomBreadcrumb(page).click();

    const home = homeView(page);
    await expect(home).toBeVisible();
    await expect(home.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    // The editor pane is hidden while Home is shown.
    await expect(editorLocator(page)).toBeHidden();
  });

  test('opening a document from Home returns to the editor', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    const home = homeView(page);
    await expect(home).toBeVisible();

    // Activate any document row; Home is dismissed and the editor reappears.
    await home.locator('[data-home-document-ref]').first().click();
    await waitForSynced(page);

    await expect(homeView(page)).toHaveCount(0);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('owns the New and Upload document actions', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    const home = homeView(page);
    await expect(home.getByRole('button', { name: 'New document' })).toBeVisible();
    await expect(home.getByRole('button', { name: 'Upload document' })).toBeVisible();

    // New document leaves Home and opens the freshly created document.
    await home.getByRole('button', { name: /new document/i }).click();
    await waitForSynced(page);
    await expect(homeView(page)).toHaveCount(0);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('opening search from the toolbar dismisses Home', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page)).toBeVisible();

    // The toolbar search stays reachable over Home; focusing it takes over the
    // content region, so Home must not stay rendered alongside search results.
    const searchInput = page.getByRole('combobox', { name: 'Search document' });
    await searchInput.click();
    await expect(homeView(page)).toHaveCount(0);

    // Search dismisses Home (not merely suppresses it): closing search returns
    // to the document, it must not bounce back to Home.
    await searchInput.press('Escape');
    await expect(homeView(page)).toHaveCount(0);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('opening the current document from Home lands on the document root', async ({ page, editor }) => {
    await editor.load('basic');
    // Zoom into a nested note, then open Home.
    await page.goto(createEditorDocumentPath(editor.docId, 'note1'));
    await waitForSynced(page);
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page)).toBeVisible();

    // Selecting the already-open document must clear zoom (document root), not
    // return to the previous zoomed subtree — so the URL no longer carries the
    // note zoom target.
    const zoomedUrl = new RegExp(`${editor.docId}[^/]*note1`);
    await expect(page).toHaveURL(zoomedUrl);
    await homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().click();
    await waitForSynced(page);

    await expect(homeView(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(zoomedUrl);
  });

  test('a history change to the zoom target dismisses Home', async ({ page, editor }) => {
    await editor.load('basic');
    // Build history: document root, then a zoomed URL.
    await page.goto(createEditorDocumentPath(editor.docId, 'note1'));
    await waitForSynced(page);

    // Open Home over the zoomed URL, then go back to the document-root URL. Only
    // the zoom target changed (same document), so Home must still dismiss.
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page)).toBeVisible();
    await page.goBack();

    await expect(homeView(page)).toHaveCount(0);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('changing the document via history dismisses Home', async ({ page, editor }) => {
    await editor.load('basic');
    const firstUrl = page.url();

    // Create a second document so history holds two different document URLs, and
    // wait for its navigation to land before interacting.
    await page.getByRole('button', { name: 'Choose document' }).click();
    await page.getByRole('option', { name: 'New', exact: true }).click();
    await expect.poll(() => page.url()).not.toBe(firstUrl);
    await waitForSynced(page);
    await expect(editorLocator(page)).toBeVisible();

    // Open Home over the new document, then go back to the previous document's
    // URL. Routing swaps the document without going through Home's handlers, so
    // Home must not keep covering the document the URL now points at.
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page)).toBeVisible();
    await page.goBack();

    await expect.poll(() => page.url()).toBe(firstUrl);
    await expect(homeView(page)).toHaveCount(0);
    await expect(editorLocator(page)).toBeVisible();
  });

  test('switching documents from the toolbar picker dismisses Home', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page)).toBeVisible();

    // The document picker stays in the toolbar over Home; choosing a document
    // must leave Home so the chosen document's editor is shown.
    await page.getByRole('button', { name: 'Choose document' }).click();
    await page.getByRole('option').first().click();
    await waitForSynced(page);

    await expect(homeView(page)).toHaveCount(0);
    await expect(editorLocator(page)).toBeVisible();
  });
});
