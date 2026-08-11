import { expect, test } from '#editor/fixtures';
import { ensureReady, waitForSynced } from '#editor/bridge';
import { editorLocator, selectInlineRange, setCaretAtText } from '#editor/locators';
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
      // Per docs/specs/outliner/note-model.md, a fresh document starts with one empty note.
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

test.describe('generic links', () => {
  test('creates, edits, and removes a link through keyboard-first controls', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    await expect(controls).toHaveCount(1);

    const label = controls.getByRole('textbox', { name: 'Text' });
    const destination = controls.getByRole('textbox', { name: 'Destination' });
    await expect(destination).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(label).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(destination).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(label).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(destination).toBeFocused();
    await destination.fill('example.com');
    await expect(label).toHaveValue('example.com');
    await destination.press('Enter');

    await expect(controls).toHaveCount(0);
    const link = editorLocator(page).locator('a[target="_blank"]');
    await expect(link).toHaveText('example.com');
    await expect(link).toHaveAttribute('href', 'https://example.com/');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('aria-label', 'example.com (opens in new tab)');

    await link.click();
    await expect(controls).toHaveCount(1);
    const edit = controls.getByRole('button', { name: 'Edit' });
    await expect(edit).toBeFocused();
    await edit.click();
    await expect(controls.getByRole('textbox', { name: 'Destination' })).toBeFocused();
    await controls.getByRole('textbox', { name: 'Text' }).fill('RemDo site');
    await controls.getByRole('textbox', { name: 'Destination' }).fill('https://remdo.app');
    await controls.getByRole('button', { name: 'Save link' }).click();

    const edited = editorLocator(page).locator('a[target="_blank"]');
    await expect(edited).toHaveText('RemDo site');
    await expect(edited).toHaveAttribute('href', 'https://remdo.app/');

    await edited.click();
    await controls.getByRole('button', { name: 'Remove link' }).click();
    await expect(controls).toHaveCount(0);
    await expect(editorLocator(page).getByRole('link', { name: /RemDo site/ })).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1RemDo site' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('keeps link controls within a narrow viewport', async ({ page, editor }) => {
    await page.setViewportSize({ width: 320, height: 240 });
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.press('ControlOrMeta+K');

    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    await expect(controls).toHaveCount(1);
    await expect.poll(async () => (await controls.boundingBox())!.x).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await controls.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => {
      const box = (await controls.boundingBox())!;
      return box.x + box.width;
    }).toBeLessThanOrEqual(320);
    await expect.poll(async () => {
      const box = (await controls.boundingBox())!;
      return box.y + box.height;
    }).toBeLessThanOrEqual(240);
  });

  test('waits for a typed URL boundary and Undo keeps the authored text', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 0);
    const url = 'https://example.com/path';
    await page.keyboard.type(url);

    const links = editorLocator(page).locator('a[target="_blank"]');
    await expect(links).toHaveCount(0);
    await page.keyboard.type(' ');
    await expect(links).toHaveText(url);
    const readCaret = () => page.evaluate(() => {
      const selection = globalThis.getSelection();
      return { offset: selection?.focusOffset, text: selection?.focusNode?.textContent };
    });
    expect(await readCaret()).toEqual({ offset: 1, text: ' note1' });

    await page.keyboard.press('ControlOrMeta+Z');
    await expect(links).toHaveCount(0);
    expect(await readCaret()).toEqual({ offset: 1, text: ' note1' });
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: `${url} note1` },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('keeps an escaped quote inside a typed URL candidate', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 0);
    const url = String.raw`https://example.com/a\"b`;
    await page.keyboard.type(`${url} `);

    const link = editorLocator(page).locator('a[target="_blank"]');
    await expect(link).toHaveText(url);
    await expect(link).toHaveAttribute('href', 'https://example.com/a/%22b');
  });

  test('immediate Undo survives stripped punctuation after an automatic link', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 0);
    const url = 'https://example.com/path';
    await page.keyboard.type(`${url}, `);

    const links = editorLocator(page).locator('a[target="_blank"]');
    await expect(links).toHaveText(url);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(links).toHaveCount(0);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: `${url}, note1` },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  test('Enter finalizes a complete URL at the end of a note', async ({ page, editor }) => {
    await editor.load('flat');
    await selectInlineRange(page, 'note1', 0, 'note1'.length);
    const url = 'https://example.com/path';
    await page.keyboard.type(url);

    const links = editorLocator(page).locator('a[target="_blank"]');
    await expect(links).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(links).toHaveText(url);
  });

  test('an inline link finalizes a deferred URL before it', async ({ page, editor }) => {
    await editor.load('flat');
    await selectInlineRange(page, 'note1', 0, 'note1'.length);
    const url = 'https://example.com/path';
    await page.keyboard.type(url);
    await expect(editorLocator(page).locator('a')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    const destination = controls.getByRole('textbox', { name: 'Destination' });
    await destination.fill('example.org');
    await destination.press('Enter');

    const links = editorLocator(page).locator('a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText(url);
    await expect(links.nth(1)).toHaveText('example.org');
  });

  test('Shift-clicking a link extends structural selection without activating it', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    await controls.getByRole('textbox', { name: 'Destination' }).fill('example.com');
    await controls.getByRole('textbox', { name: 'Destination' }).press('Enter');

    await setCaretAtText(page, 'note1', 0);
    const link = editorLocator(page).locator('a[target="_blank"]');
    const box = (await link.boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up('Shift');

    await expect(editorLocator(page).locator('.editor-input')).toHaveClass(/editor-input--structural/);
    await expect(controls).toHaveCount(0);
  });

  test('drag-selecting link text does not open link controls', async ({ page, editor }) => {
    await editor.load('flat');
    await selectInlineRange(page, 'note2', 0, 'note2'.length);
    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    await controls.getByRole('textbox', { name: 'Destination' }).fill('example.com');
    await controls.getByRole('textbox', { name: 'Destination' }).press('Enter');

    const link = editorLocator(page).locator('a[target="_blank"]');
    const box = (await link.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(controls).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.getSelection()?.isCollapsed)).toBe(false);
  });

  test('action mode consumes unbound browser navigation keys', async ({ page, editor }) => {
    await editor.load('flat');
    await selectInlineRange(page, 'note2', 0, 'note2'.length);
    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    await controls.getByRole('textbox', { name: 'Destination' }).fill('example.com');
    await controls.getByRole('textbox', { name: 'Destination' }).press('Enter');

    await editorLocator(page).locator('a[target="_blank"]').click();
    const edit = controls.getByRole('button', { name: 'Edit' });
    await expect(edit).toBeFocused();
    const before = await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
      globalThis.scrollTo(0, 600);
      return { href: globalThis.location.href, scrollY: globalThis.scrollY };
    });
    expect(before.scrollY).toBeGreaterThan(0);

    await edit.press('Home');

    expect(await page.evaluate(() => ({ href: globalThis.location.href, scrollY: globalThis.scrollY }))).toEqual(before);
  });

  test('direct pointer activation opens exactly one tab per gesture', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    const destination = new URL('/admin', page.url()).toString();
    await controls.getByRole('textbox', { name: 'Destination' }).fill(destination);
    await controls.getByRole('textbox', { name: 'Destination' }).press('Enter');

    const link = editorLocator(page).locator('a[target="_blank"]');
    const context = page.context();
    const initialPages = context.pages().length;
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    try {
      await link.click();
    } finally {
      await page.keyboard.up(modifier);
    }
    await expect.poll(() => context.pages().length).toBe(initialPages + 1);
    await context.pages().at(-1)!.close();

    await link.click({ button: 'middle' });
    await expect.poll(() => context.pages().length).toBe(initialPages + 1);
    await context.pages().at(-1)!.close();

    await page.keyboard.down('Shift');
    try {
      await link.click({ button: 'middle' });
    } finally {
      await page.keyboard.up('Shift');
    }
    await expect.poll(() => context.pages().length).toBe(initialPages + 1);
    await context.pages().at(-1)!.close();
  });

  test('an in-editor click dismisses controls without restoring over the click', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.press('ControlOrMeta+K');
    const controls = editorLocator(page).getByRole('dialog', { name: 'Link controls' });
    await expect(controls).toHaveCount(1);

    await editorLocator(page).getByText('note2', { exact: true }).click();
    await expect(controls).toHaveCount(0);
    await page.keyboard.type('x');
    await expect(editorLocator(page).locator('li').nth(0)).toHaveText('note1');
    await expect(editorLocator(page).locator('li').nth(1)).toContainText('x');
  });

});
