import { $isLinkNode } from '@lexical/link';
import { PASTE_COMMAND } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $isInternalNoteLinkNode } from '#lib/editor/internal-note-link-node';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { parseInternalNoteLinkUrl } from '@/editor/links/internal-link-url';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { clearEditorProps, createDataTransfer, meta, placeCaretAtNote, pressKey, registerScopedEditorProps, typeText } from '#tests';

async function pastePlainText(remdo: RemdoTestApi, text: string) {
  const transfer = createDataTransfer();
  transfer.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: transfer });
  await remdo.dispatchCommand(PASTE_COMMAND, event, { expect: 'any' });
}

describe('note links (docs/outliner/links.md)', () => {
  const ZOOM_LINK_SCOPE_KEY = registerScopedEditorProps('links-zoom-scope', { zoomNoteId: 'note2' });

  it('inserts a link with Enter and keeps stable note identity in link state', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note2 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note2');
      expect($isInternalNoteLinkNode(linkNode)).toBe(true);
      if ($isInternalNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBeUndefined();
      }
      expect(parseInternalNoteLinkUrl(linkNode.getURL())?.noteId).toBe('note2');
      expect(note.getTextContent().endsWith(' ')).toBe(true);
    });
  });

  it('confirms the active option with Tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note3');
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('pasting the same-document note URL creates an internal link without docId', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = `/n/${remdo.getCollabDocId()}_note2`;
    await pastePlainText(remdo, url);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note2' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note2');
      expect($isInternalNoteLinkNode(linkNode)).toBe(true);
      if ($isInternalNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBeUndefined();
      }
    });
  });

  it('pasting a cross-document note URL creates an internal link with docId', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = new URL('/n/otherdoc_note2', globalThis.location.href).toString();
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isInternalNoteLinkNode(linkNode)).toBe(true);
      if ($isInternalNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBe('otherdoc');
      }
    });
  });

  it('keeps filtered results in document order', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note');

    const optionTitles = [...document.querySelectorAll('.note-link-picker__title')].map((node) => node.textContent);
    expect(optionTitles).toEqual(['note2', 'note3']);
  });

  it('does not include the current note in picker options', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note');

    const optionTitles = [...document.querySelectorAll('.note-link-picker__title')].map((node) => node.textContent);
    expect(optionTitles).toEqual(['note1', 'note3']);
  });

  it('shows the no-results row when the query has no matches', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@missing');

    expect(document.querySelector('[data-note-link-picker-item]')).toBeNull();
    const listbox = document.querySelector('.note-link-picker[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox!.getAttribute('aria-activedescendant')).toBeNull();
    const emptyRow = document.querySelector('[data-note-link-picker-empty="true"]');
    expect(emptyRow).not.toBeNull();
    expect(emptyRow!.textContent.trim()).toBe('No results...');
  });

  it('closes link mode on Enter when there are no results and keeps typed text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@missing');
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@missing' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('closes link mode on Tab when there are no results and keeps typed text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@missing');
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@missing' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('tracks active option via aria-activedescendant and aria-selected', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note');

    const readPicker = () => {
      const listbox = document.querySelector<HTMLElement>('.note-link-picker[role="listbox"]');
      expect(listbox).not.toBeNull();
      const rows = [...document.querySelectorAll<HTMLElement>('[data-note-link-picker-item]')];
      expect(rows).toHaveLength(2);
      return { listbox: listbox!, rows };
    };

    let picker = readPicker();
    expect(picker.rows[0]!.id).not.toBe('');
    expect(picker.rows[1]!.id).not.toBe('');
    expect(picker.listbox.getAttribute('aria-activedescendant')).toBe(picker.rows[0]!.id);
    expect(picker.rows[0]!.getAttribute('aria-selected')).toBe('true');
    expect(picker.rows[1]!.getAttribute('aria-selected')).toBe('false');

    await pressKey(remdo, { key: 'ArrowDown' });
    picker = readPicker();
    expect(picker.listbox.getAttribute('aria-activedescendant')).toBe(picker.rows[1]!.id);
    expect(picker.rows[0]!.getAttribute('aria-selected')).toBe('false');
    expect(picker.rows[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('closes link mode on editor blur', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note');

    const root = remdo.editor.getRootElement();
    expect(root).not.toBeNull();
    root!.dispatchEvent(new FocusEvent('blur'));
    await remdo.waitForSynced();

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes link mode on outside mouse down', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note');

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await remdo.waitForSynced();

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('clamps ArrowUp and ArrowDown picker navigation at boundaries', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@');

    const activeTitle = () => document.querySelector('[data-note-link-picker-item-active="true"] .note-link-picker__title')?.textContent;
    expect(activeTitle()).toBe('note2');

    await pressKey(remdo, { key: 'ArrowUp' });
    expect(activeTitle()).toBe('note2');

    await pressKey(remdo, { key: 'ArrowDown' });
    expect(activeTitle()).toBe('note3');

    await pressKey(remdo, { key: 'ArrowDown' });
    expect(activeTitle()).toBe('note3');
  });

  it('confirms a picker option with pointer down', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note');

    const rows = [...document.querySelectorAll<HTMLElement>('[data-note-link-picker-item]')];
    expect(rows).toHaveLength(2);

    const option = rows[1]!;
    option.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    await remdo.waitForSynced();

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('shows minimal ancestor context for duplicate titles', meta({ fixture: 'duplicate-titles' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@task');

    const rows = [...document.querySelectorAll('[data-note-link-picker-item]')];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.querySelector('.note-link-picker__title')?.textContent)).toEqual(['task', 'task']);
    expect(rows.map((row) => row.querySelector('.note-link-picker__context')?.textContent)).toEqual(['note2', 'note4']);
  });

  it(
    'searches the whole document while zoomed',
    meta({ fixture: 'tree', editorPropsKey: ZOOM_LINK_SCOPE_KEY }),
    async ({ remdo }) => {
      try {
        await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
        await typeText(remdo, '@note1');
        await pressKey(remdo, { key: 'Enter' });

        expect(remdo).toMatchOutline([
          { noteId: 'note1', text: 'note1' },
          {
            noteId: 'note2',
            text: 'note2',
            children: [{ noteId: 'note3', text: 'note3note1 ' }],
          },
        ]);
      } finally {
        clearEditorProps(ZOOM_LINK_SCOPE_KEY);
      }
    }
  );

  it('removes @query token on Escape', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');
    await pressKey(remdo, { key: 'Escape' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('keeps @ as plain text on Backspace when query is empty', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@');
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('does not reopen link mode after Backspace exits empty query', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@');
    await pressKey(remdo, { key: 'Backspace' });
    await typeText(remdo, 'n');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@n' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });
});
