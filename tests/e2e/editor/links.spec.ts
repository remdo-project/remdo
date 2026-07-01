import { expect, test } from '#editor/fixtures';
import { ensureReady, waitForSynced } from '#editor/bridge';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { createUserDocument } from '../_support/documents';
import { createEditorDocumentPath } from './_support/routes';

test.describe('note links', () => {
  test('inserts a note link from @ picker with Enter', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @note2');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toContainText('note2');

    await page.keyboard.press('Enter');

    await expect(picker).toHaveCount(0);
    await expect(editorLocator(page).getByRole('link', { name: 'note2' })).toHaveCount(1);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1 note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('swallows Ctrl/Cmd+Enter while the @ picker is open (no toggle-checked underneath)', async ({ page, editor }) => {
    // The picker owns the keyboard: an app shortcut chord (Cmd/Ctrl+Enter, which
    // toggles the note checked) must not run on the document underneath. Needs a
    // real browser — the fix is about KEY_DOWN command ordering vs. the app keymap.
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' @note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);

    const note1 = editorLocator(page).locator('li.list-item', { hasText: 'note1' }).first();
    await expect(note1).not.toHaveClass(/list-item-checked/);
    await page.keyboard.press('ControlOrMeta+Enter');

    // The chord did nothing: the note is still unchecked and the picker is open.
    // (The swallow is scoped to the app's structural chords — Cmd/Ctrl+Enter and
    // Cmd/Ctrl+Shift+Arrow — so ordinary editing chords like paste/copy/undo fall
    // through and can still edit the query. See useTriggerSession's CRITICAL
    // KEY_DOWN handler; paste-into-query is covered by inspection, not here, since
    // driving the OS clipboard in headless Chromium is unreliable.)
    await expect(note1).not.toHaveClass(/list-item-checked/);
    await expect(picker).toHaveCount(1);
  });

  test('exposes the combobox ARIA contract on the editor host while @ is open', async ({ page, editor }) => {
    // WAI-ARIA combobox: because the @ picker keeps DOM focus in the editor, the
    // combobox role lives on the editor host (not the popup), with aria-controls
    // →listbox and aria-activedescendant→highlighted option. It clears on close.
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    const host = editorLocator(page).locator('.editor-input').first();
    await expect(host).not.toHaveAttribute('role', 'combobox');

    await page.keyboard.type(' @note2');
    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);

    // Role/expanded on the host; aria-controls points at the listbox's id.
    await expect(host).toHaveAttribute('role', 'combobox');
    await expect(host).toHaveAttribute('aria-expanded', 'true');
    const listboxId = await picker.getAttribute('id');
    expect(listboxId).toBeTruthy();
    await expect(host).toHaveAttribute('aria-controls', listboxId!);

    // aria-activedescendant on the host matches the highlighted option's id.
    const activeOption = picker.locator('[data-note-link-picker-item-active="true"]');
    const activeId = await activeOption.getAttribute('id');
    expect(activeId).toBeTruthy();
    await expect(host).toHaveAttribute('aria-activedescendant', activeId!);

    // Escape closes the picker and clears the combobox state from the host.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(host).not.toHaveAttribute('role', 'combobox');
    await expect(host).not.toHaveAttribute('aria-controls', /.*/);
    await expect(host).not.toHaveAttribute('aria-activedescendant', /.*/);
  });

  test('clicking a note link navigates to zoom target', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @note2');
    await page.keyboard.press('Enter');

    const link = editorLocator(page).getByRole('link', { name: 'note2' });
    await expect(link).toHaveCount(1);

    await link.click();

    await expect(page).toHaveURL(new RegExp(String.raw`/n/${editor.docId}_note2$`));
  });

  test('inserts a note link from picker using pointer click', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    const note3Option = picker.locator('[data-note-link-picker-item]').filter({ hasText: 'note3' }).first();
    await expect(note3Option).toHaveCount(1);

    await note3Option.hover();
    await expect(note3Option).toHaveAttribute('data-note-link-picker-item-active', 'true');

    await note3Option.click();

    await expect(picker).toHaveCount(0);
    await expect(editorLocator(page).getByRole('link', { name: 'note3' })).toHaveCount(1);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1 note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('updates listbox active descendant for keyboard and hover', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @note');

    // aria-activedescendant lives on the editor host (the combobox), not the
    // listbox: the @ picker keeps DOM focus in the editor (see popups.md).
    const host = editorLocator(page).locator('.editor-input').first();
    const listbox = editorLocator(page).locator('.note-link-picker[role="listbox"]');
    const options = listbox.locator('[data-note-link-picker-item]');
    const note2Option = options.filter({ hasText: 'note2' }).first();
    const note3Option = options.filter({ hasText: 'note3' }).first();

    await expect(options).toHaveCount(2);

    const note2Id = await note2Option.getAttribute('id');
    const note3Id = await note3Option.getAttribute('id');
    expect(note2Id).toBeTruthy();
    expect(note3Id).toBeTruthy();

    await expect(host).toHaveAttribute('aria-activedescendant', note2Id!);
    await expect(note2Option).toHaveAttribute('aria-selected', 'true');
    await expect(note3Option).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('ArrowDown');

    await expect(host).toHaveAttribute('aria-activedescendant', note3Id!);
    await expect(note2Option).toHaveAttribute('aria-selected', 'false');
    await expect(note3Option).toHaveAttribute('aria-selected', 'true');

    await note2Option.hover();

    await expect(host).toHaveAttribute('aria-activedescendant', note2Id!);
    await expect(note2Option).toHaveAttribute('aria-selected', 'true');
    await expect(note3Option).toHaveAttribute('aria-selected', 'false');
  });

  test('arrow keys navigate the picker even when the editing note has a body', async ({ page, editor }) => {
    // A note with an adjacent body would otherwise have its plain Up/Down arrows
    // intercepted by body navigation; an open picker must take them first.
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('the body');

    // Back to note1's content, then open the @ picker.
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' @note');

    const host = editorLocator(page).locator('.editor-input').first();
    const listbox = editorLocator(page).locator('.note-link-picker[role="listbox"]');
    const options = listbox.locator('[data-note-link-picker-item]');
    const note2Option = options.filter({ hasText: 'note2' }).first();
    const note3Option = options.filter({ hasText: 'note3' }).first();
    await expect(options).toHaveCount(2);

    const note3Id = await note3Option.getAttribute('id');

    // ArrowDown moves the active option to note3 (it does not redirect the caret
    // past the body). aria-activedescendant is on the editor host (the combobox).
    await page.keyboard.press('ArrowDown');
    await expect(host).toHaveAttribute('aria-activedescendant', note3Id!);
    await expect(note3Option).toHaveAttribute('aria-selected', 'true');
    await expect(note2Option).toHaveAttribute('aria-selected', 'false');

    // The picker ignores Left/Right, so ArrowRight must still run body navigation
    // (skip past the body) rather than entering it from outside the note.
    await page.keyboard.press('ArrowRight');
    const focusInBody = await page.evaluate(() => {
      const node = globalThis.getSelection()?.focusNode ?? null;
      const el = node instanceof Element ? node : node?.parentElement ?? null;
      return Boolean(el?.closest('.note-body'));
    });
    expect(focusInBody).toBe(false);
  });

  test('pressing Enter on no-results closes picker and keeps typed query text', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @missing');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-empty="true"]')).toHaveCount(1);

    await page.keyboard.press('Enter');

    await expect(picker).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1 @missing' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('outside click closes link-query mode', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);

    await page.evaluate(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });

    await expect(picker).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1 @note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('editor blur closes link-query mode', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.type(' @note');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);

    await editorLocator(page).locator('.editor-input').first().evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.blur();
      }
    });

    await expect(picker).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1 @note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('searches the whole document while zoomed into a subtree', async ({ page, editor }) => {
    await editor.load('tree');

    await page.goto(createEditorDocumentPath(editor.docId, 'note2'));
    await editorLocator(page).locator('.editor-input').first().waitFor();

    await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' @note1');

    const picker = editorLocator(page).locator('[data-note-link-picker]');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toHaveCount(1);
    await expect(picker.locator('[data-note-link-picker-item]')).toContainText('note1');

    await page.keyboard.press('Enter');

    await expect(editorLocator(page).getByRole('link', { name: 'note1' })).toHaveCount(1);
  });

  test('cross-document paste keeps link target doc from clipboard payload across isolated browser contexts', async ({ page, editor, newEditorContext }) => {
    await editor.load('links');
    await setCaretAtText(page, 'same ', 0);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const copyCombo = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
    await page.keyboard.press(copyCombo);

    const destinationContext = await newEditorContext();
    const destinationPage = await destinationContext.newPage();
    try {
      const destinationDocument = await createUserDocument(destinationPage, `Destination ${Date.now()}`);
      const destinationDocId = destinationDocument.id;
      await destinationPage.goto(createEditorDocumentPath(destinationDocId));
      await editorLocator(destinationPage).locator('.editor-input').first().waitFor();
      await ensureReady(destinationPage);
      // Per docs/outliner/concepts.md, a fresh document starts with one empty note.
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
