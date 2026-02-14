import { expect, test } from '#editor/fixtures';
import { ensureReady, waitForSynced } from '#editor/bridge';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { createEditorDocumentPath } from './_support/routes';

test.describe('note links', () => {
  test('inserts a note link from @ picker with Enter', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note2');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toContainText('note2');

    await page.keyboard.press('Enter');

    await expect(picker).toHaveCount(0);
    await expect(editorLocator(page).getByRole('link', { name: 'note2' })).toHaveCount(1);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('clicking a note link navigates to zoom target', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note2');
    await page.keyboard.press('Enter');

    const link = editorLocator(page).getByRole('link', { name: 'note2' });
    await expect(link).toHaveCount(1);

    await link.click();

    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}_note2$`));
  });

  test('inserts a note link from picker using pointer click', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    const note3Option = picker.locator('[data-note-link-picker-item]').filter({ hasText: 'note3' }).first();
    await expect(note3Option).toHaveCount(1);

    await note3Option.hover();
    await expect(note3Option).toHaveAttribute('data-note-link-picker-item-active', 'true');

    await note3Option.click();

    await expect(picker).toHaveCount(0);
    await expect(editorLocator(page).getByRole('link', { name: 'note3' })).toHaveCount(1);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('updates listbox active descendant for keyboard and hover', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note');

    const listbox = editorLocator(page).locator('.note-link-picker[role="listbox"]');
    const options = listbox.locator('[data-note-link-picker-item]');
    const note2Option = options.filter({ hasText: 'note2' }).first();
    const note3Option = options.filter({ hasText: 'note3' }).first();

    await expect(options).toHaveCount(2);

    const note2Id = await note2Option.getAttribute('id');
    const note3Id = await note3Option.getAttribute('id');
    expect(note2Id).toBeTruthy();
    expect(note3Id).toBeTruthy();

    await expect(listbox).toHaveAttribute('aria-activedescendant', note2Id!);
    await expect(note2Option).toHaveAttribute('aria-selected', 'true');
    await expect(note3Option).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('ArrowDown');

    await expect(listbox).toHaveAttribute('aria-activedescendant', note3Id!);
    await expect(note2Option).toHaveAttribute('aria-selected', 'false');
    await expect(note3Option).toHaveAttribute('aria-selected', 'true');

    await note2Option.hover();

    await expect(listbox).toHaveAttribute('aria-activedescendant', note2Id!);
    await expect(note2Option).toHaveAttribute('aria-selected', 'true');
    await expect(note3Option).toHaveAttribute('aria-selected', 'false');
  });

  test('pressing Enter on no-results closes picker and keeps typed query text', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@missing');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-empty="true"]')).toHaveCount(1);

    await page.keyboard.press('Enter');

    await expect(picker).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1@missing' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('outside click closes link-query mode', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);

    await page.evaluate(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });

    await expect(picker).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1@note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('editor blur closes link-query mode', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type('@note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);

    await editorLocator(page).locator('.editor-input').first().evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.blur();
      }
    });

    await expect(picker).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1@note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('searches the whole document while zoomed into a subtree', async ({ page, editor }) => {
    await editor.load('tree');

    await page.goto(createEditorDocumentPath(editor.docId, 'note2'));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
    await page.keyboard.type('@note1');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toContainText('note1');

    await page.keyboard.press('Enter');

    await expect(editorLocator(page).getByRole('link', { name: 'note1' })).toHaveCount(1);
  });

  test('cross-document paste keeps link target doc from clipboard payload across isolated browser contexts', async ({ browser, page, editor }) => {
    await editor.load('links');
    await setCaretAtText(page, 'same ', 0);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const copyCombo = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
    await page.keyboard.press(copyCombo);

    const destinationDocId = createUniqueNoteId();
    const destinationContext = await browser.newContext();
    const destinationPage = await destinationContext.newPage();
    try {
      await destinationPage.goto(createEditorDocumentPath(destinationDocId));
      await editorLocator(destinationPage).locator('.editor-input').first().waitFor();
      await ensureReady(destinationPage, { clear: true });
      // Per docs/outliner/concepts.md, a document never becomes empty; after clear there is one empty note.
      // Click the editor input to place the caret in that note without loading a fixture.
      await editorLocator(destinationPage).locator('.editor-input').first().click();
      const pasteCombo = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
      await destinationPage.keyboard.press(pasteCombo);
      await waitForSynced(destinationPage);

      const pastedLink = editorLocator(destinationPage).getByRole('link', { name: 'note2' }).last();
      await expect(pastedLink).toHaveAttribute('href', new RegExp(`/n/${editor.docId}_note2$`));
    } finally {
      await destinationContext.close();
    }
  });
});
