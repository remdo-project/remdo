import { expect, test } from '#editor/fixtures';
import { documentLocationHeader, homeView, homeZoomBreadcrumb, noteRow } from '#editor/locators';
import { waitForSynced } from './_support/bridge';
import { createEditorDocumentPath } from './_support/routes';

test('renames from the document heading and Home without navigating or changing the outline', async ({ page, editor, context }) => {
  await editor.load('tree');
  const originalOutline = await editor.getEditorState();
  const heading = documentLocationHeader(page).getByRole('heading');
  const initialName = await heading.innerText();
  const other = await context.newPage();
  await other.goto(createEditorDocumentPath(editor.docId));
  await waitForSynced(other);
  const trigger = documentLocationHeader(page).getByRole('button', { name: `Actions for ${initialName}` });
  await trigger.focus();
  await trigger.press('Enter');
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  const input = page.getByRole('textbox', { name: 'Document name' });
  await expect(input).toBeFocused();
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBe(initialName.length);
  await input.fill('Draft name');
  await expect(documentLocationHeader(other).getByRole('heading')).toHaveText(initialName);
  await input.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(heading).toHaveText(initialName);

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await input.fill('  Renamed  document  ');
  await input.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(heading).toHaveText('Renamed  document');
  await expect(documentLocationHeader(other).getByRole('heading')).toHaveText('Renamed  document');
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actions for Renamed  document' })).toBeFocused();

  await homeZoomBreadcrumb(page).click();
  const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().locator('..');
  await row.getByRole('button', { name: 'Actions for Renamed  document' }).click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await input.fill('Named from Home');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(row.getByRole('button', { name: 'Actions for Named from Home' })).toBeFocused();
  await expect(documentLocationHeader(other).getByRole('heading')).toHaveText('Named from Home');
  await row.locator('[data-home-document-ref]').click();
  await waitForSynced(page);
  expect(await editor.getEditorState()).toEqual(originalOutline);
  await other.close();
});

test('keeps an open draft through a remote rename and submitting the untouched opening name is a no-op', async ({ page, editor }) => {
  await editor.load('basic');
  const initialName = await documentLocationHeader(page).getByRole('heading').innerText();
  await documentLocationHeader(page).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  const input = page.getByRole('textbox', { name: 'Document name' });
  const response = await page.request.patch(`/api/documents/${editor.docId}`, { data: { title: 'Collaborator name' } });
  expect(response.ok()).toBe(true);
  await expect(documentLocationHeader(page).getByRole('heading')).toHaveText('Collaborator name');
  await expect(input).toHaveValue(initialName);
  await input.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await waitForSynced(page);
  await expect(documentLocationHeader(page).getByRole('heading')).toHaveText('Collaborator name');
});

test('document heading offers view folding without treating the heading as an editor note', async ({ page, editor }) => {
  await editor.load('tree');
  await documentLocationHeader(page).getByRole('button').click();
  await expect(page.getByRole('menuitem', { name: 'Toggle checked' })).toHaveCount(0);
  await page.getByRole('menu').press('1');
  await expect(noteRow(page, 'note3')).toBeHidden();
  await expect(documentLocationHeader(page).getByRole('heading')).toBeVisible();
  await documentLocationHeader(page).getByRole('button').click();
  await page.getByRole('menu').press('0');
  await expect(noteRow(page, 'note3')).toBeVisible();
});

for (const entry of ['click', 'shortcut'] as const) {
  test(`document heading Zoom out opens Home by ${entry}`, async ({ page, editor }) => {
    await editor.load('basic');
    await documentLocationHeader(page).getByRole('button').click();
    if (entry === 'click') {
      await page.getByRole('menuitem', { name: 'Zoom out' }).click();
    } else {
      await page.getByRole('menu').press('o');
    }
    await expect(page).toHaveURL('/');
    await expect(homeView(page).getByRole('heading', { name: 'Home', exact: true })).toBeFocused();
    const row = homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().locator('..');
    await row.getByRole('button', { name: /^Actions for / }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Rename…']);
  });
}
