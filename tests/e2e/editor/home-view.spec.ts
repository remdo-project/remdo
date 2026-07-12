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
});
