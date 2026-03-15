import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { act } from '@testing-library/react';
import { $createTextNode, CONTROLLED_TEXT_INSERTION_COMMAND, PASTE_COMMAND } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import { $isNoteLinkNode } from '#lib/editor/note-link-node';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { createDataTransfer, meta, placeCaretAtNote, pressKey, selectEntireNote, typeText } from '#tests';

async function pastePlainText(remdo: RemdoTestApi, text: string) {
  const transfer = createDataTransfer();
  transfer.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: transfer });
  await remdo.dispatchCommand(PASTE_COMMAND, event, { expect: 'any' });
}

async function typeAltGraphAt(remdo: RemdoTestApi) {
  const root = remdo.editor.getRootElement();
  expect(root).not.toBeNull();

  const event = new KeyboardEvent('keydown', {
    key: '@',
    bubbles: true,
    cancelable: true,
    altKey: true,
    ctrlKey: true,
  });

  await act(async () => {
    const allowed = root!.dispatchEvent(event);
    if (allowed) {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, '@');
    }
  });

  await remdo.waitForSynced();
}

describe('note links (docs/outliner/links.md)', () => {
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
      expect($isNoteLinkNode(linkNode)).toBe(true);
      if ($isNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBe(remdo.getCollabDocId());
      }
      expect(note.getTextContent().endsWith(' ')).toBe(true);
    });
  });

  it('opens link-query mode when @ is entered with AltGr modifiers', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeAltGraphAt(remdo);

    // Many non-US layouts produce '@' via AltGr (reported as Ctrl+Alt).
    // We enforce this so link-query remains keyboard-accessible on those layouts.
    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();
    const optionTitles = [...document.querySelectorAll('.note-link-picker__title')].map((node) => node.textContent);
    expect(optionTitles).toEqual(['note2', 'note3']);
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

  it('pasting the same-document note URL creates a note link with docId', meta({ fixture: 'flat' }), async ({ remdo }) => {
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
      expect($isNoteLinkNode(linkNode)).toBe(true);
      if ($isNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBe(remdo.getCollabDocId());
      }
    });
  });

  it('pasting an absolute same-document note URL still creates a note link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = new URL(`/n/${remdo.getCollabDocId()}_note2`, globalThis.location.href).toString();
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note2');
      expect($isNoteLinkNode(linkNode)).toBe(true);
      if ($isNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBe(remdo.getCollabDocId());
      }
    });
  });

  it('pasting a same-origin note URL with query or fragment creates a canonical note link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = `${new URL(`/n/${remdo.getCollabDocId()}_note2`, globalThis.location.href).toString()}?foo=1#frag`;
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note2');
      expect($isNoteLinkNode(linkNode)).toBe(true);
      if ($isNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBe(remdo.getCollabDocId());
      }
    });
  });

  it('pasting a cross-document note URL creates a note link with docId', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = new URL('/n/otherDoc_note2', globalThis.location.href).toString();
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(true);
      if ($isNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
        expect(linkNode.getDocId()).toBe('otherDoc');
      }
    });
  });

  it('pasting an external URL creates a regular link that opens in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('clicking an external link opens a new tab without opener access', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await pastePlainText(remdo, url);

    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    try {
      const anchor = remdo.editor.getRootElement()!.querySelector('a')!;
      await act(async () => {
        anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });

      expect(openSpy).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('normalizes imported-style external LinkNodes to open in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const linkNode = $createLinkNode(url);
        linkNode.append($createTextNode('Example'));
        note.append(linkNode);
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('Example');
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('normalizes imported-style protocol-relative LinkNodes to open in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = '//example.com/path';
    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const linkNode = $createLinkNode(url);
        linkNode.append($createTextNode('Example'));
        note.append(linkNode);
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('Example');
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('normalizes imported-style www LinkNodes to open in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const text = 'www.example.com/path';
    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const linkNode = $createLinkNode(text);
        linkNode.append($createTextNode('Example'));
        note.append(linkNode);
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('Example');
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(`https://${text}`);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('normalizes imported-style relative LinkNodes to open in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = '/n/main_note2';
    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const linkNode = $createLinkNode(url);
        linkNode.append($createTextNode('Example'));
        note.append(linkNode);
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('Example');
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('pasting a foreign note-shaped URL keeps it as a regular external link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/n/main_note2';
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('typing an external URL creates a regular link that opens in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, url);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('typing a protocol-relative URL creates a regular link that opens in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = '//example.com/path';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, url);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('typing a long-TLD external URL creates a regular link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.technology/';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, url);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('typing a long-TLD www URL creates a regular link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const text = 'www.example.technology/';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(text);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(`https://${text}`);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('typing a bare domain leaves plain text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const text = 'example.com';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(text);
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('typing a bare long-TLD domain leaves plain text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const text = 'example.technology/';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(text);
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('typing a same-origin note URL creates a regular link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = new URL(`/n/${remdo.getCollabDocId()}_note2`, globalThis.location.href).toString();
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, url);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe(url);
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('keeps inserted link display text unchanged when the target note is later renamed', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');
    await pressKey(remdo, { key: 'Enter' });

    await selectEntireNote(remdo, 'note2');
    await typeText(remdo, 'renamed note2');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1note2 ' },
      { noteId: 'note2', text: 'renamed note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note2');
    });
  });

  it('rehydrates same-document fixture links with current docId in runtime state', meta({ fixture: 'links' }), async ({ remdo }) => {
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const links = note.getChildren().filter($isNoteLinkNode);
      const sameDocLink = links[0]!;
      const crossDocLink = links[1]!;

      expect(sameDocLink.getNoteId()).toBe('note2');
      expect(sameDocLink.getDocId()).toBe(remdo.getCollabDocId());

      expect(crossDocLink.getNoteId()).toBe('remoteNote');
      expect(crossDocLink.getDocId()).toBe('otherDoc');
    });
  });

  it('accepts spaces and punctuation in link query text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');
    await typeText(remdo, ' !');

    const picker = document.querySelector('[data-note-link-picker]');
    expect(picker).not.toBeNull();
    expect(document.querySelector('[data-note-link-picker-item]')).toBeNull();
    const emptyRow = document.querySelector('[data-note-link-picker-empty="true"]');
    expect(emptyRow).not.toBeNull();
    expect(emptyRow!.textContent.trim()).toBe('No results...');

    await pressKey(remdo, { key: 'Enter' });
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@note2 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
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
    meta({ fixture: 'tree', editorProps: { zoomNoteId: 'note2' } }),
    async ({ remdo }) => {
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
