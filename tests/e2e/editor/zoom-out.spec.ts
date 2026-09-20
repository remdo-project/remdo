import type { Page } from '#editor/fixtures';
import { createUserDocument } from '../_support/documents';
import { expect, test } from '#editor/fixtures';
import { editorLocator, homeView, zoomBreadcrumbs } from '#editor/locators';
import { load, waitForSynced } from './_support/bridge';
import { openNoteMenu } from './_support/menu';
import { createEditorDocumentPath } from './_support/routes';

async function expectCaretAtStart(page: Page, text: string) {
  await expect(editorLocator(page).locator('.editor-input')).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const selection = globalThis.getSelection();
    return {
      text: selection?.anchorNode?.textContent,
      offset: selection?.anchorOffset,
      collapsed: selection?.isCollapsed,
    };
  })).toEqual({ text, offset: 0, collapsed: true });
}

test('Zoom out passes through a document root before Home', async ({ page }) => {
  const document = await createUserDocument(page, 'Zoom document');
  const documentPath = createEditorDocumentPath(document.id);
  await page.goto(documentPath);
  await load(page, 'tree-complex');
  const search = page.getByRole('combobox', { name: 'Search document' });
  await search.fill('note5');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/n\/[^/]+_note5$/);
  await expectCaretAtStart(page, 'note5');

  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
  await page.keyboard.press('o');
  await expect(page).toHaveURL(documentPath);
  await expectCaretAtStart(page, 'note5');

  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
  await page.keyboard.press('o');
  await expect(page).toHaveURL('/');
  await expect(homeView(page).getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
});

test('Zoom out uses the current view and restores the branch just left', async ({ page, editor }) => {
  await editor.load('tree-complex');
  await page.goto(createEditorDocumentPath(editor.docId, 'note2'));
  await waitForSynced(page);

  // The menu belongs to note3, but Zoom out leaves the current view (note2).
  const menu = await openNoteMenu(page, 'note3');
  const zoomOut = menu.item('zoom-out');
  await expect(zoomOut).toHaveAccessibleName('Zoom out');
  await expect(zoomOut.locator('.note-menu-shortcut')).toHaveText('o');
  await zoomOut.click();
  await menu.expectClosed();
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, 'note1'));
  await expectCaretAtStart(page, 'note2');

  await openNoteMenu(page, 'note4');
  await menu.item('zoom').click();
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, 'note4'));
  await expectCaretAtStart(page, 'note4');
  await openNoteMenu(page, 'note4');
  await zoomOut.click();
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, 'note1'));
  // note4 is the second child: focusing the first child would lose our place.
  await expectCaretAtStart(page, 'note4');
});

test('double Shift then O zooms out after search and continues to Home', async ({ page, editor }) => {
  await editor.load('tree-complex');
  const search = page.getByRole('combobox', { name: 'Search document' });
  await search.fill('note3');
  await search.press('Enter');
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, 'note3'));
  await expectCaretAtStart(page, 'note3');

  for (const [parent, branch] of [['note2', 'note3'], ['note1', 'note2'], [null, 'note1']] as const) {
    // Type the complete sequence without waiting for the menu to render.
    await page.keyboard.press('Shift');
    await page.keyboard.press('Shift');
    await page.keyboard.press('o');
    await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, parent));
    await expectCaretAtStart(page, branch);
    await expect(page.getByRole('menu', { name: 'Quick action menu' })).toHaveCount(0);
  }

  const menu = await openNoteMenu(page, 'note1', { anchor: 'caret', openMethod: 'shortcut' });
  await expect(menu.item('zoom-out')).toHaveAccessibleName('Zoom out');
  await expect(menu.item('zoom-out').locator('.note-menu-shortcut')).toHaveText('o');
  await menu.pressShortcut('o');
  await menu.expectClosed();
  const heading = homeView(page).getByRole('heading', { name: 'Home', level: 1 });
  await expect(heading).toBeFocused();

  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
  await page.keyboard.press('o');
  await expect(heading).toBeFocused();
  await menu.expectClosed();
});

test('Zoom out opens Home by pointer and the current document can be reopened', async ({ page, editor }) => {
  await editor.load('tree-complex');
  const menu = await openNoteMenu(page, 'note3');
  await menu.menu.getByRole('menuitem', { name: 'Zoom out' }).click();
  await menu.expectClosed();
  await expect(page).toHaveURL('/');
  await expect(homeView(page).getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();

  await homeView(page).locator(`[data-home-document-ref="${editor.docId}"]`).first().click();
  await expect(homeView(page)).toHaveCount(0);
  await expect(editorLocator(page).locator('.editor-input')).toBeVisible();
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId));
});

test('ancestor breadcrumbs remain keyboard-operable and focus the branch just left', async ({ page, editor }) => {
  await editor.load('tree-complex');
  await page.goto(createEditorDocumentPath(editor.docId, 'note3'));
  await waitForSynced(page);

  const ancestor = zoomBreadcrumbs(page).getByRole('button', { name: 'note1', exact: true });
  await ancestor.focus();
  await ancestor.press('Enter');
  await expect(page).toHaveURL(createEditorDocumentPath(editor.docId, 'note1'));
  await expectCaretAtStart(page, 'note2');
});
