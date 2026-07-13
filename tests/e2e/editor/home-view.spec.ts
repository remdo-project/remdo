import { expect, test } from '#editor/fixtures';
import { editorLocator, homeView, homeZoomBreadcrumb } from '#editor/locators';
import { waitForSynced } from './_support/bridge';

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

  test('omits entry-point groups that have no entries', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    const home = homeView(page);
    await expect(home).toBeVisible();
    // Tags has no placeholder entries, so its group is not rendered.
    await expect(home.getByRole('group', { name: 'Tags' })).toHaveCount(0);
  });

  test('lists documents grouped under their source heading', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    const home = homeView(page);
    // The local source renders as a "Current Server" group holding its documents.
    const currentServer = home.getByRole('group', { name: 'Current Server' });
    await expect(currentServer).toBeVisible();
    await expect(currentServer.locator('[data-home-document-ref]').first()).toBeVisible();
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

  test('changing the document via history dismisses Home', async ({ page, editor }) => {
    await editor.load('basic');

    // Create a second document so history holds two different document URLs.
    await page.getByRole('button', { name: 'Choose document' }).click();
    await page.getByRole('option', { name: 'New', exact: true }).click();
    await waitForSynced(page);

    // Open Home over the new document, then go back to the previous document's
    // URL. Routing swaps the document without going through Home's handlers, so
    // Home must not keep covering the document the URL now points at.
    await homeZoomBreadcrumb(page).click();
    await expect(homeView(page)).toBeVisible();
    await page.goBack();

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
