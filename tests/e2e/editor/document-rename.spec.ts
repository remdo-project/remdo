import { expect, isolatedTest as test } from '#editor/fixtures';
import { homeView, homeZoomBreadcrumb } from '#editor/locators';
import { waitForSynced } from './_support/bridge';

test.describe('Document rename', () => {
  test('renames from a Home row without opening the document or changing its outline', async ({ page, editor }) => {
    await editor.load('tree');
    const originalOutline = await editor.getEditorState();
    await homeZoomBreadcrumb(page).click();
    await expect(page).toHaveURL('/');

    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().locator('..');
    const initialName = await row.locator('[data-home-document-ref]').innerText();
    const trigger = row.getByRole('button', { name: `Actions for ${initialName}` });

    await trigger.focus();
    await trigger.press('Enter');
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const input = page.getByRole('textbox', { name: 'Document name' });
    await expect(input).toBeFocused();
    await input.fill('  Renamed  document  ');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Actions for Renamed document' })).toBeFocused();
    await expect(page).toHaveURL('/');

    await row.locator('[data-home-document-ref]').click();
    await waitForSynced(page);
    expect(await editor.getEditorState()).toEqual(originalOutline);
  });

  test('discards the draft on Escape and restores focus to the invoking button', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().locator('..');
    const initialName = await row.locator('[data-home-document-ref]').innerText();
    const trigger = row.getByRole('button', { name: `Actions for ${initialName}` });

    await row.hover();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const input = page.getByRole('textbox', { name: 'Document name' });
    await input.fill('Draft name');
    await input.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(row.locator('[data-home-document-ref]')).toHaveText(initialName);
  });

  test('reports a rejected empty name and keeps the dialog open for retry', async ({ page, editor }) => {
    await editor.load('basic');
    await homeZoomBreadcrumb(page).click();

    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().locator('..');
    const initialName = await row.locator('[data-home-document-ref]').innerText();
    await row.hover();
    await row.getByRole('button', { name: `Actions for ${initialName}` }).click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();

    const input = page.getByRole('textbox', { name: 'Document name' });
    await input.fill('   ');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Enter a document name.');

    await input.fill('Second attempt');
    await input.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row.locator('[data-home-document-ref]')).toHaveText('Second attempt');
  });
});
