import { $createAutoLinkNode, $createLinkNode, $isAutoLinkNode, $isLinkNode } from '@lexical/link';
import { act, fireEvent, waitFor } from '@testing-library/react';
import {
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  INDENT_CONTENT_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import type { SerializedLexicalNode, TextNode } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import { config } from '#config';
import { $isNoteLinkNode } from '#client/editor/runtime/note-link-node';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import {
  collapseDomSelectionAtNode,
  createDataTransfer,
  extendDomSelectionToNode,
  findSerializedNode,
  getNoteBodyTextNode,
  meta,
  placeCaretAtNote,
  pressKey,
  selectEntireNote,
  selectStructuralNotes,
  typeText,
} from '#tests';
import { getNoteBody } from '#client/editor/features/note-body/note-body-ops';

async function pastePlainText(remdo: RemdoTestApi, text: string) {
  const transfer = createDataTransfer();
  transfer.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: transfer });
  await remdo.dispatchCommand(PASTE_COMMAND, event, { expect: 'any' });
}

async function removeFirstGenericLink(remdo: RemdoTestApi) {
  await act(async () => {
    fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!);
  });
  const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
  const remove = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Remove link')!;
  await act(async () => {
    fireEvent.click(remove);
  });
  await remdo.waitForSynced();
}

interface SerializedAutoLinkForTest extends SerializedLexicalNode {
  children: SerializedLexicalNode[];
  type: 'autolink';
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

describe('note links (docs/specs/outliner/links.md)', () => {
  it('inserts a link with Enter and keeps stable note identity in link state', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note2');
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 note2 ' },
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
    expect(remdo.editor.getRootElement()!.querySelector('a[data-note-link]')).not.toBeNull();
  });

  it('opens link-query mode when @ is entered with AltGr modifiers', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' ');
    await typeAltGraphAt(remdo);

    // Many non-US layouts produce '@' via AltGr (reported as Ctrl+Alt).
    // We enforce this so link-query remains keyboard-accessible on those layouts.
    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();
    const optionTitles = Array.from(document.querySelectorAll('.note-link-picker__title'), (node) => node.textContent);
    expect(optionTitles).toEqual(['note2', 'note3']);
  });

  it('does not confirm on Tab: closes the picker and leaves the @query as text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Tab is structural in an outliner (indent); the picker must not steal it to
    // commit. Tab closes the picker and the typed @query stays as plain text — no
    // link is inserted.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note3');
    await pressKey(remdo, { key: 'Tab' });

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getChildren().some($isLinkNode)).toBe(false);
      expect(note.getTextContent()).toContain('@note3');
    });
  });

  it('swallows a modifier+Enter while the picker is open (no commit, no editor command)', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // The picker owns the keyboard: a modifier commit combo it does not declare
    // (Cmd/Ctrl+Enter, normally toggle-checked) is a no-op while open — it neither
    // confirms the option nor runs the editor command beneath.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note3');
    await pressKey(remdo, { key: 'Enter', ctrlOrMeta: true });

    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getChildren().some($isLinkNode)).toBe(false);
    });
  });

  it('pasting a parent-note URL uses only the target own text as its label', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    const url = `/n/${remdo.getCollabDocId()}_note2`;
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

  it('pasting a note URL over selected body text creates a note link in the body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A body is rich text and supports note links. Selecting body text and
    // pasting a note URL must replace it with a note-link node, not plain text.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'bodytext');

    // Select the first 4 chars of the body, then paste the note URL over them.
    const bodyTextNode = getNoteBodyTextNode(remdo, 'note1');
    await collapseDomSelectionAtNode(bodyTextNode, 0);
    await extendDomSelectionToNode(bodyTextNode, 4);
    await pastePlainText(remdo, `/n/${remdo.getCollabDocId()}_note2`);

    remdo.validate(() => {
      const body = getNoteBody($findNoteById('note1')!)!;
      const linkNode = body.getChildren().find($isLinkNode)!;
      expect($isNoteLinkNode(linkNode)).toBe(true);
      expect(linkNode.getTextContent()).toBe('body');
      if ($isNoteLinkNode(linkNode)) {
        expect(linkNode.getNoteId()).toBe('note2');
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
      expect(linkNode.getTextContent()).toBe('note1');
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('pasting a destination over an existing generic link preserves its label', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');
    await remdo.mutate(() => {
      const text = $findNoteById('note1')!.getChildren().find($isLinkNode)!.getFirstChild<TextNode>()!;
      text.select(0, text.getTextContentSize());
    });

    await pastePlainText(remdo, 'example.org/path');

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
      expect(link.getTextContent()).toBe('note1');
      expect(link.getURL()).toBe('https://example.org/path');
    });
  });

  it('pasting a destination over part of a generic link changes only the selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = $createLinkNode('https://example.com/');
      const text = $createTextNode('linked');
      link.append(text);
      note.clear();
      note.append(link);
      text.select(0, 3);
    });

    await pastePlainText(remdo, 'https://example.org/');

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe('linked');
      const links = note.getChildren().filter($isLinkNode);
      expect(links.map(link => [link.getTextContent(), link.getURL()])).toEqual([
        ['lin', 'https://example.org/'],
        ['ked', 'https://example.com/'],
      ]);
    });
  });

  it('replaces selected note-link text with a generic link that preserves its label', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pastePlainText(remdo, `/n/${remdo.getCollabDocId()}_note2`);
    await remdo.mutate(() => {
      const text = $findNoteById('note1')!.getChildren().find($isNoteLinkNode)!.getFirstChild<TextNode>()!;
      text.select(0, 2);
    });

    await pastePlainText(remdo, 'https://example.com/');

    remdo.validate(() => {
      const links = $findNoteById('note1')!.getChildren().filter($isLinkNode);
      expect(links.map(link => [link.getTextContent(), link.getURL(), $isNoteLinkNode(link)])).toEqual([
        ['no', 'https://example.com/', false],
        ['te2', `/n/${remdo.getCollabDocId()}_note2`, true],
      ]);
    });
  });

  it('pasting a destination over mixed linked and unlinked text preserves the selected label', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = $createLinkNode('https://example.com/');
      link.append($createTextNode('linked'));
      note.clear();
      note.append($createTextNode('before '), link, $createTextNode(' after'));
      note.select(0, note.getChildrenSize());
    });

    await pastePlainText(remdo, 'https://example.org/');

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe('before linked after');
      const links = note.getChildren().filter($isLinkNode);
      expect(links).toHaveLength(1);
      expect(links[0]!.getTextContent()).toBe('before linked after');
      expect(links[0]!.getURL()).toBe('https://example.org/');
    });
  });

  it('keeps Cmd/Ctrl+K closed for mixed linked and unlinked text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = $createLinkNode('https://example.com/');
      link.append($createTextNode('linked'));
      note.clear();
      note.append($createTextNode('before '), link, $createTextNode(' after'));
      note.select(0, note.getChildrenSize());
    });

    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    expect(document.querySelector('[data-link-controls]')).toBeNull();
  });

  it('clicking an external link opens link controls without navigating', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await pastePlainText(remdo, url);

    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    try {
      const anchor = remdo.editor.getRootElement()!.querySelector('a')!;
      await act(async () => {
        anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });

      expect(openSpy).not.toHaveBeenCalled();
      expect(document.querySelector('[data-link-controls]')).not.toBeNull();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('cmd/ctrl-clicking an external link opens a new tab without opener access', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await pastePlainText(remdo, url);

    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    try {
      const anchor = remdo.editor.getRootElement()!.querySelector('a')!;
      await act(async () => {
        anchor.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
        }));
      });

      expect(openSpy).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('opens a destination from link controls and closes them', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await pastePlainText(remdo, url);

    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    try {
      await act(async () => fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!));
      const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
      const open = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Open')!;
      await act(async () => fireEvent.click(open));

      expect(openSpy).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
      expect(document.querySelector('[data-link-controls]')).toBeNull();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('copies a destination when the Clipboard API is unavailable', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await pastePlainText(remdo, url);

    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    try {
      await act(async () => {
        fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!);
      });
      const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
      const copy = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Copy destination')!;
      await act(async () => {
        fireEvent.click(copy);
      });
      expect(execCommand).toHaveBeenCalledWith('copy');
      await waitFor(() => expect(document.querySelector('[data-link-controls]')).toBeNull());
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('falls back when the Clipboard API rejects the copy', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');

    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    try {
      await act(async () => {
        fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!);
      });
      const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
      const copy = [...controls.querySelectorAll('button')]
        .find((button) => button.textContent === 'Copy destination')!;
      await act(async () => {
        fireEvent.click(copy);
      });
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('https://example.com/');
        expect(execCommand).toHaveBeenCalledWith('copy');
        expect(document.querySelector('[data-link-controls]')).toBeNull();
      });
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('closes controls when every copy mechanism fails', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');

    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        throw new TypeError('Copy unavailable');
      }),
    });
    try {
      await act(async () => fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!));
      const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
      const copy = [...controls.querySelectorAll('button')]
        .find((button) => button.textContent === 'Copy destination')!;
      await act(async () => fireEvent.click(copy));

      await waitFor(() => expect(document.querySelector('[data-link-controls]')).toBeNull());
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('does not open a stale destination from link controls', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');
    await act(async () => fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!));
    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const open = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Open')!;
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    try {
      await act(async () => new Promise<void>((resolve) => {
        remdo.editor.update(() => {
          $findNoteById('note1')!.getChildren().find($isLinkNode)!.setURL('https://example.org/');
        }, {
          onUpdate: () => {
            fireEvent.click(open);
            resolve();
          },
        });
      }));

      expect(openSpy).not.toHaveBeenCalled();
      expect(document.querySelector('[data-link-controls]')).toBeNull();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('does not let a stale copy completion close newer link controls', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');
    await selectEntireNote(remdo, 'note2');
    await pastePlainText(remdo, 'https://example.org/');

    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let finishCopy!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => {
      finishCopy = resolve;
    }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const anchors = remdo.editor.getRootElement()!.querySelectorAll('a');
      await act(async () => fireEvent.click(anchors[0]!));
      const firstControls = document.querySelector<HTMLElement>('[data-link-controls]')!;
      const copy = [...firstControls.querySelectorAll('button')]
        .find((button) => button.textContent === 'Copy destination')!;
      await act(async () => fireEvent.click(copy));

      await act(async () => fireEvent.keyDown(firstControls, { key: 'Escape' }));
      await act(async () => fireEvent.click(anchors[1]!));
      const secondControls = document.querySelector<HTMLElement>('[data-link-controls]')!;
      expect(secondControls).not.toBe(firstControls);

      await act(async () => finishCopy());
      expect(document.querySelector('[data-link-controls]')).toBe(secondControls);
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('consumes non-editing shortcuts inside link controls', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll('input')[1]!;
    const leaked = vi.fn();
    document.addEventListener('keydown', leaked);
    try {
      const dispatched = fireEvent.keyDown(destination, { ctrlKey: true, key: 'f' });
      expect(dispatched).toBe(false);
      expect(leaked).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', leaked);
    }
  });

  it('rebinds link interactions when Lexical replaces the editor root', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');

    const originalRoot = remdo.editor.getRootElement()!;
    const replacementRoot = document.createElement('div');
    originalRoot.parentElement!.append(replacementRoot);
    try {
      await act(async () => {
        remdo.editor.setRootElement(replacementRoot);
      });
      const link = replacementRoot.querySelector('a');
      expect(link).not.toBeNull();
      await act(async () => {
        fireEvent.click(link!);
      });
      expect(document.querySelector('[data-link-controls]')).not.toBeNull();
    } finally {
      await act(async () => {
        remdo.editor.setRootElement(originalRoot);
      });
      replacementRoot.remove();
    }
  });

  it('creates a labeled link from selected text with Cmd/Ctrl+K', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = [...controls.querySelectorAll<HTMLInputElement>('input')];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.value).toBe('note1');
    await waitFor(() => {
      expect(document.activeElement).toBe(inputs[1]);
    });

    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { value: 'example.com/path' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isLinkNode)!;
      expect(link.getTextContent()).toBe('note1');
      expect(link.getURL()).toBe('https://example.com/path');
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.isCollapsed()).toBe(true);
      if ($isRangeSelection(selection)) {
        expect(selection.anchor.getNode().is(note)).toBe(true);
        expect(selection.anchor.offset).toBe(link.getIndexWithinParent() + 1);
      }
    });
    expect(document.querySelector('[data-link-controls]')).toBeNull();
  });

  it('preserves selected rich-text nodes when creating a link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const bold = $createTextNode('bold').toggleFormat('bold');
      const italic = $createTextNode('italic').toggleFormat('italic');
      note.clear();
      note.append(bold, italic);
      const selection = $createRangeSelection();
      selection.setTextNodeRange(bold, 0, italic, italic.getTextContentSize());
      $setSelection(selection);
    });
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: 'example.com' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
      expect(link.getChildren().map((child) => [child.getTextContent(), $isTextNode(child) && child.getFormat()])).toEqual([
        ['bold', 1],
        ['italic', 2],
      ]);
    });
  });

  it('opens actions for an element selection containing exactly one body link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    const bodyText = getNoteBodyTextNode(remdo, 'note1');
    await collapseDomSelectionAtNode(bodyText, 0);
    await extendDomSelectionToNode(bodyText, bodyText.textContent.length);
    await pastePlainText(remdo, 'https://example.com/');
    await remdo.mutate(() => {
      const body = getNoteBody($findNoteById('note1')!)!;
      body.select(0, body.getChildrenSize());
    });

    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    expect([...controls.querySelectorAll('button')].some(button => button.textContent === 'Edit')).toBe(true);
  });

  it('uses an entered destination as the label at a collapsed caret', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = [...controls.querySelectorAll<HTMLInputElement>('input')];
    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { value: 'example.com' } });
    });
    expect(inputs[0]!.value).toBe('example.com');

    await act(async () => {
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isLinkNode)!;
      expect(link.getTextContent()).toBe('example.com');
      expect(link.getURL()).toBe('https://example.com/');
    });
  });

  it('creates a note link with the target own text when controls receive an owned note URL', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = [...controls.querySelectorAll<HTMLInputElement>('input')];
    await act(async () => {
      fireEvent.change(inputs[1]!, {
        target: { value: `/n/${remdo.getCollabDocId()}_note2` },
      });
    });
    expect(inputs[0]!.value).toBe('note2');

    await act(async () => {
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isNoteLinkNode)!;
      expect(link.getTextContent()).toBe('note2');
      expect(link.getNoteId()).toBe('note2');
    });
  });

  it('uses the note URL as fallback for a whitespace selection and empty target', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      for (const noteId of ['note1', 'note2']) {
        const text = $findNoteById(noteId)!.getFirstChild();
        if ($isTextNode(text)) {
          text.setTextContent('   ');
        }
      }
    });
    await selectEntireNote(remdo, 'note1');
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = [...controls.querySelectorAll<HTMLInputElement>('input')];
    const url = `/n/${remdo.getCollabDocId()}_note2`;
    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { value: url } });
    });
    expect(inputs[0]!.value).toBe(url);

    await act(async () => {
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();
    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isNoteLinkNode)!;
      expect(link.getTextContent()).toBe(url);
      expect(link.getNoteId()).toBe('note2');
    });
  });

  it('requires text for a generic link over a whitespace selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const text = $findNoteById('note1')!.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent('   ');
      }
    });
    await selectEntireNote(remdo, 'note1');
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = [...controls.querySelectorAll<HTMLInputElement>('input')];
    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { value: 'example.com' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Enter link text.');
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe('   ');
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('does not open generic link controls inside a note link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note2');
    await pressKey(remdo, { key: 'Enter' });
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isNoteLinkNode)!;
      const text = link.getFirstChild();
      if ($isTextNode(text)) {
        text.select(0, 0);
      }
    });

    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).toBeNull();
  });

  it('does not open generic link controls for a structural selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note1');
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).toBeNull();
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1'] });
  });

  it('closes link controls when another popup dispatches Escape', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    await remdo.dispatchCommand(KEY_ESCAPE_COMMAND);
    await waitFor(() => {
      expect(document.querySelector('[data-link-controls]')).toBeNull();
    });
  });

  it('restores editor focus when an outside pointer closes link controls', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    await waitFor(() => {
      expect(document.querySelector('[data-link-controls]')).toBeNull();
      expect(document.activeElement).toBe(remdo.editor.getRootElement());
    });
  });

  it('closes controls when their selected-text target changes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const text = note.getFirstChild();
      if ($isTextNode(text)) {
        text.setTextContent('changed');
      }
    });
    await waitFor(() => {
      expect(document.querySelector('[data-link-controls]')).toBeNull();
      expect(document.activeElement).toBe(remdo.editor.getRootElement());
    });
  });

  it('closes controls when a pinned element boundary moves between children', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const before = $createLinkNode('https://example.com/');
      const after = $createLinkNode('https://example.org/');
      before.append($createTextNode('before'));
      after.append($createTextNode('after'));
      note.clear();
      note.append(before, after);
      note.select(1, 1);
    });
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls]')).not.toBeNull();

    await remdo.mutate(() => {
      const inserted = $createLinkNode('https://example.net/');
      inserted.append($createTextNode('inserted'));
      $findNoteById('note1')!.splice(0, 0, [inserted]);
    });
    await waitFor(() => {
      expect(document.querySelector('[data-link-controls]')).toBeNull();
    });
  });

  it('edits a generic link label and destination through the same controls', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, 'https://example.com/');

    const anchor = remdo.editor.getRootElement()!.querySelector('a')!;
    await act(async () => {
      fireEvent.click(anchor);
    });
    let controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const edit = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Edit')!;
    await waitFor(() => {
      expect(document.activeElement).toBe(edit);
    });

    await act(async () => {
      fireEvent.click(edit);
    });
    controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = [...controls.querySelectorAll<HTMLInputElement>('input')];
    await waitFor(() => {
      expect(document.activeElement).toBe(inputs[1]);
    });
    await act(async () => {
      fireEvent.change(inputs[0]!, { target: { value: 'Email us' } });
    });
    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { value: 'team@example.com' } });
    });
    await act(async () => {
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isLinkNode)!;
      expect($isAutoLinkNode(link)).toBe(false);
      expect(link.getTextContent()).toBe('Email us');
      expect(link.getURL()).toBe('mailto:team@example.com');
      expect(link.getTarget()).toBeNull();
      expect(link.getRel()).toBeNull();
    });
  });

  it('converts an edited automatic link to a labeled link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();

    await act(async () => fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!));
    let controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const edit = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Edit')!;
    await act(async () => fireEvent.click(edit));
    controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const inputs = controls.querySelectorAll<HTMLInputElement>('input');
    await act(async () => {
      fireEvent.change(inputs[0]!, { target: { value: 'Example' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
      expect($isAutoLinkNode(link)).toBe(false);
      expect(link.getTextContent()).toBe('Example');
      expect(link.getURL()).toBe(url);
    });
  });

  it('does not replace an existing generic link with a note URL', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await pastePlainText(remdo, url);
    await act(async () => fireEvent.click(remdo.editor.getRootElement()!.querySelector('a')!));
    let controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const edit = [...controls.querySelectorAll('button')].find((button) => button.textContent === 'Edit')!;
    await act(async () => fireEvent.click(edit));
    controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: `/n/${remdo.getCollabDocId()}_note2` } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain('cannot replace a web link');
    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
      expect($isNoteLinkNode(link)).toBe(false);
      expect(link.getURL()).toBe(url);
    });
  });

  it('keeps controls open and leaves the document unchanged after invalid submission', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });

    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: 'javascript:alert(1)' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });

    expect(document.querySelector('[data-link-controls]')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('valid web address');
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('removes an automatic link without relinking until its text changes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, 'https://example.com/ ');
    });
    await remdo.waitForSynced();

    await removeFirstGenericLink(remdo);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();

    await placeCaretAtNote(remdo, 'note1', 1);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    expect(document.querySelector('[data-link-controls] button[type="submit"]')).not.toBeNull();
    await remdo.dispatchCommand(KEY_ESCAPE_COMMAND);

    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        const link = note.getChildren().find($isAutoLinkNode)!;
        const text = link.getFirstChild();
        if ($isTextNode(text)) {
          text.setTextContent('HTTPS://EXAMPLE.COM/');
        }
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      expect(link.getIsUnlinked()).toBe(false);
      expect(link.getURL()).toBe('https://example.com/');
    });

    await removeFirstGenericLink(remdo);

    await act(async () => {
      const restored = remdo.editor.parseEditorState(JSON.stringify(remdo.getEditorState()));
      remdo.editor.setEditorState(restored);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();

    const editedState = structuredClone(remdo.getEditorState());
    const serializedLink = findSerializedNode(
      [editedState.root],
      (node): node is SerializedAutoLinkForTest => node.type === 'autolink' && 'children' in node,
    )!;
    const serializedText = serializedLink.children[0] as SerializedLexicalNode & { text: string };
    serializedText.text = 'https://example.org/';
    await act(async () => {
      const restored = remdo.editor.parseEditorState(JSON.stringify(editedState));
      remdo.editor.setEditorState(restored);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getIsUnlinked()).toBe(false);
      expect(link.getURL()).toBe('https://example.org/');
    });
  });

  it('keeps a suppressed automatic-link occurrence when only adjacent text changes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();
    await removeFirstGenericLink(remdo);

    await remdo.mutate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      const next = link.getNextSibling();
      if ($isTextNode(next)) {
        next.setTextContent('adjacent');
      }
    });

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe(url);
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
  });

  it('creates an active explicit link over a selected suppressed occurrence', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();
    await removeFirstGenericLink(remdo);
    await remdo.mutate(() => {
      const text = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!.getFirstChild<TextNode>()!;
      text.select(0, text.getTextContentSize());
    });

    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: 'example.org' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isLinkNode)!;
      expect($isAutoLinkNode(link)).toBe(false);
      expect(link.getTextContent()).toBe(url);
      expect(link.getURL()).toBe('https://example.org/');
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).not.toBeNull();
  });

  it('does not nest an explicit link created at a caret in suppressed text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();
    await removeFirstGenericLink(remdo);
    await remdo.mutate(() => {
      const text = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!.getFirstChild<TextNode>()!;
      text.select(1, 1);
    });

    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: 'example.org' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const links = $findNoteById('note1')!.getChildren().filter($isLinkNode);
      expect(links).toHaveLength(1);
      expect($isLinkNode(links[0]!.getParent())).toBe(false);
      expect(links[0]!.getURL()).toBe('https://example.org/');
    });
  });

  it('does not nest a note link created from suppressed text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();
    await removeFirstGenericLink(remdo);
    await remdo.mutate(() => {
      const text = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!.getFirstChild<TextNode>()!;
      text.select(0, text.getTextContentSize());
    });

    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: `/n/${remdo.getCollabDocId()}_note2` } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const links = note.getChildren().filter($isLinkNode);
      expect(links).toHaveLength(1);
      expect($isNoteLinkNode(links[0])).toBe(true);
      expect($isLinkNode(links[0]!.getParent())).toBe(false);
    });
  });

  it('immediate Undo removes automatic link formatting but preserves authored text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await typeText(remdo, url);
    await typeText(remdo, ' ');

    remdo.validate(() => {
      expect($findNoteById('note1')!.getTextContent()).toBe(`${url} `);
    });

    await remdo.dispatchCommand(UNDO_COMMAND);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getChildren().map(child => [child.getType(), child.getTextContent()])).toEqual([
        ['autolink', url],
        ['text', ' '],
      ]);
      expect(note.getTextContent()).toBe(`${url} `);
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();

    await remdo.dispatchCommand(UNDO_COMMAND);
    remdo.validate(() => {
      expect($findNoteById('note1')!.getTextContent()).not.toBe(`${url} `);
      expect($findNoteById('note1')!.getChildren().find($isLinkNode)).toBeUndefined();
    });

    await remdo.dispatchCommand(REDO_COMMAND);
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(`${url} `);
      expect(note.getChildren().find($isAutoLinkNode)?.getIsUnlinked()).toBe(true);
    });
  });

  it('does not consume Undo after a later non-keyboard document mutation', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note2');
    await typeText(remdo, url);
    await typeText(remdo, ' ');
    await remdo.dispatchCommand(INDENT_CONTENT_COMMAND);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', children: [{ noteId: 'note2', text: `${url} ` }] },
      { noteId: 'note3', text: 'note3' },
    ]);

    await remdo.dispatchCommand(UNDO_COMMAND);
    remdo.validate(() => {
      const note = $findNoteById('note2')!;
      expect(note.getParent()?.is($findNoteById('note1')!.getParent())).toBe(true);
      expect(note.getTextContent()).toBe(config.env.COLLAB_ENABLED ? 'note2' : `${url} `);
      expect(note.getChildren().some(
        child => $isAutoLinkNode(child) && child.getIsUnlinked(),
      )).toBe(false);
    });
  });

  it('does not suppress an automatic link after the selection moves away', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await typeText(remdo, url);
    await typeText(remdo, ' ');
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);

    await remdo.dispatchCommand(UNDO_COMMAND);
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(config.env.COLLAB_ENABLED ? 'note1' : url);
      expect(note.getChildren().some(
        child => $isAutoLinkNode(child) && child.getIsUnlinked(),
      )).toBe(false);
    });
  });

  it('immediate Undo suppresses the last of two equal automatic links', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} and ${url} `);
    });
    await remdo.waitForSynced();
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().filter($isAutoLinkNode).map(link => link.getIsUnlinked())).toEqual([
        false,
        false,
      ]);
    });

    await remdo.dispatchCommand(UNDO_COMMAND);
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().filter($isAutoLinkNode).map(link => link.getIsUnlinked())).toEqual([
        false,
        true,
      ]);
    });
  });

  it('unwraps an active automatic link when its opening boundary becomes invalid', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const before = $createTextNode(' ');
      const link = $createAutoLinkNode(url);
      link.append($createTextNode(url));
      note.clear();
      note.append(before, link, $createTextNode(' '));
    });
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isAutoLinkNode)).toBeDefined();
    });

    await remdo.mutate(() => {
      const before = $findNoteById('note1')!.getFirstChild();
      if ($isTextNode(before)) {
        before.setTextContent(',');
      }
    });
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('reprocesses an active automatic link when trailing text joins its candidate', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/base';
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = $createAutoLinkNode(url);
      link.append($createTextNode(url));
      note.clear();
      note.append(link, $createTextNode(' /path'));
    });

    await remdo.mutate(() => {
      const suffix = $findNoteById('note1')!.getLastChild<TextNode>()!;
      suffix.setTextContent('/path');
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(`${url}/path`);
      expect(note.getChildren().filter($isAutoLinkNode).map(link => link.getURL())).toEqual([`${url}/path`]);
    });
  });

  it('does not create an automatic link after a non-opening sibling boundary', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const before = $createTextNode('x');
      const candidate = $createTextNode(url).toggleFormat('bold');
      note.clear();
      note.append(before, candidate, $createTextNode(' '));
      candidate.markDirty();
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(`x${url} `);
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('reprocesses adjacent automatic links as one contiguous candidate', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const firstUrl = 'https://example.com/';
    const secondUrl = 'https://example.org/';
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const first = $createAutoLinkNode(firstUrl);
      first.append($createTextNode(firstUrl));
      const second = $createAutoLinkNode(secondUrl);
      second.append($createTextNode(secondUrl));
      note.clear();
      note.append(first, second);
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(`${firstUrl}${secondUrl}`);
      expect(note.getChildren().filter($isAutoLinkNode).map(link => link.getURL())).toEqual([`${firstUrl}${secondUrl}`]);
    });
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

  it('keeps an imported protocol-relative destination in an inactive link', meta({ fixture: 'flat' }), async ({ remdo }) => {
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
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe('Example');
      expect(link.getURL()).toBe(url);
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
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

  it('keeps an imported relative destination in an inactive link', meta({ fixture: 'flat' }), async ({ remdo }) => {
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
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe('Example');
      expect(link.getURL()).toBe(url);
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
  });

  it('normalizes imported-style external AutoLinkNodes to open in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    const state = structuredClone(remdo.getEditorState()) as {
      root: { children?: Array<{ children?: unknown[] }> };
    };
    const rootChildren = state.root.children ?? [];
    const listNode = rootChildren.find((node) => Array.isArray(node.children));
    const listItems = Array.isArray(listNode?.children) ? listNode.children as Array<{ noteId?: string; children?: unknown[] }> : [];
    const note = listItems.find((node) => node.noteId === 'note1')!;
    note.children = [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Example',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        isUnlinked: false,
        rel: null,
        target: null,
        title: null,
        type: 'autolink',
        url,
        version: 1,
      },
    ];
    await act(async () => {
      const parsed = remdo.editor.parseEditorState(JSON.stringify(state));
      remdo.editor.setEditorState(parsed);
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

  it('lets Undo pass through after an imported-style automatic link is created', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await remdo.mutate(() => {
      const linkNode = $createAutoLinkNode(url, {
        rel: 'noopener noreferrer',
        target: '_blank',
      });
      const text = $createTextNode(url);
      linkNode.append(text);
      $getSelection()!.insertNodes([linkNode]);
      text.select(url.length, url.length);
    });

    await remdo.dispatchCommand(UNDO_COMMAND);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe('note1');
      expect(note.getChildren().find($isAutoLinkNode)).toBeUndefined();
    });
  });

  it('keeps an imported unsupported destination in an inactive link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const linkNode = $createLinkNode('javascript:alert(1)');
        linkNode.append($createTextNode('Example'));
        note.append(linkNode);
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe('Example');
      expect(link.getURL()).toBe('javascript:alert(1)');
      expect(link.getIsUnlinked()).toBe(true);
    });

    await act(async () => {
      const restored = remdo.editor.parseEditorState(JSON.stringify(remdo.getEditorState()));
      remdo.editor.setEditorState(restored);
    });
    await remdo.waitForSynced();
    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      expect(link.getURL()).toBe('javascript:alert(1)');
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
  });

  it('keeps a recognizable label inactive when its imported destination is invalid', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const label = 'https://example.com/';
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      const linkNode = $createLinkNode('javascript:alert(1)');
      linkNode.append($createTextNode(label));
      note.append(linkNode);
    });

    remdo.validate(() => {
      const link = $findNoteById('note1')!.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe(label);
      expect(link.getURL()).toBe('javascript:alert(1)');
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
  });

  it('keeps an imported unsupported AutoLink destination inactive', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.update(() => {
        const note = $findNoteById('note1')!;
        note.clear();
        const linkNode = $createAutoLinkNode('javascript:alert(1)');
        linkNode.append($createTextNode('Example'));
        note.append(linkNode);
      });
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe('Example');
      expect(link.getURL()).toBe('javascript:alert(1)');
      expect(link.getIsUnlinked()).toBe(true);
    });
    expect(remdo.editor.getRootElement()!.querySelector('a')).toBeNull();
  });

  it('pasting a foreign note-shaped URL keeps it as a regular external link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/n/main_note2';
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('note1');
      expect($isNoteLinkNode(linkNode)).toBe(false);
      expect(linkNode.getURL()).toBe(url);
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('waits for following input before linking a character-by-character URL', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/path';
    await typeText(remdo, url);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(url);
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });

    await typeText(remdo, ' ');
    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe(url);
      expect(link.getURL()).toBe(url);
    });
  });

  it('clears stale typed deferral before a collapsed-caret URL paste', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await typeText(remdo, 'x');
    await selectEntireNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Backspace' });
    await placeCaretAtNote(remdo, 'note2', 0);
    await pastePlainText(remdo, url);

    remdo.validate(() => {
      const link = $findNoteById('note2')!.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe(url);
      expect(link.getURL()).toBe(url);
    });
  });

  it('defers a batched URL insertion until following boundary input', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, url);
    });
    await remdo.waitForSynced();
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isLinkNode)).toBeUndefined();
    });

    await typeText(remdo, ' ');
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isAutoLinkNode)?.getURL()).toBe(url);
    });
  });

  it('keeps a deferred URL unlinked when a preceding text sibling becomes dirty', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/';
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const before = $createTextNode(' ').toggleFormat('bold');
      const candidate = $createTextNode('seed');
      note.clear();
      note.append(before, candidate);
      candidate.select(0, candidate.getTextContentSize());
    });
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, url);
    });
    await remdo.waitForSynced();
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isLinkNode)).toBeUndefined();
    });

    await remdo.mutate(() => {
      const before = $findNoteById('note1')!.getFirstChild<TextNode>()!;
      before.setTextContent('  ');
    });
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isLinkNode)).toBeUndefined();
    });

    await typeText(remdo, ' ');
    remdo.validate(() => {
      expect($findNoteById('note1')!.getChildren().find($isAutoLinkNode)?.getURL()).toBe(url);
    });
  });

  it('finalizes a deferred URL when an explicit link creates its inline boundary', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const url = 'https://example.com/path';
    await selectEntireNote(remdo, 'note1');
    await typeText(remdo, url);
    await pressKey(remdo, { key: 'k', ctrlOrMeta: true });
    const controls = document.querySelector<HTMLElement>('[data-link-controls]')!;
    const destination = controls.querySelectorAll<HTMLInputElement>('input')[1]!;
    await act(async () => {
      fireEvent.change(destination, { target: { value: 'example.org' } });
      fireEvent.click(controls.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const links = $findNoteById('note1')!.getChildren().filter($isLinkNode);
      expect(links.map(link => [link.getTextContent(), link.getURL()])).toEqual([
        [url, url],
        ['example.org', 'https://example.org/'],
      ]);
      expect($isAutoLinkNode(links[0])).toBe(true);
    });
  });

  it('typing an external URL creates a regular link that opens in a new tab', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.com/';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
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

    const anchor = remdo.editor.getRootElement()!.querySelector<HTMLAnchorElement>('a')!;
    expect(anchor.getAttribute('aria-label')).toBe(`${url} (opens in new tab)`);
  });

  it('typing an email address creates a mail link without web-link attributes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const address = 'team@example.com';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${address} `);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isLinkNode)!;
      expect(link.getTextContent()).toBe(address);
      expect(link.getURL()).toBe(`mailto:${address}`);
      expect(link.getTarget()).toBeNull();
      expect(link.getRel()).toBeNull();
    });
  });

  it('keeps an automatically recognized destination synchronized with direct text edits', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, 'https://example.com/ ');
    });
    await remdo.waitForSynced();

    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      link.getFirstChild<TextNode>()!.setTextContent('https://example.org/path');
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      expect(link.getTextContent()).toBe('https://example.org/path');
      expect(link.getURL()).toBe('https://example.org/path');
    });
  });

  it('turns directly edited automatic-link text into ordinary text when it no longer matches', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, 'https://example.com/ ');
    });
    await remdo.waitForSynced();

    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      const link = note.getChildren().find($isAutoLinkNode)!;
      const text = link.getFirstChild<TextNode>()!;
      text.select(0, 0);
      text.setTextContent('not a destination');
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe('not a destination ');
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('typing a credential-bearing URL leaves the complete candidate as text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://user:password@example.com/path';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(`${url} `);
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('typing a protocol-relative URL leaves plain text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = '//example.com/path';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
    });
    await remdo.waitForSynced();

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      expect(note.getTextContent()).toBe(`${url} `);
      expect(note.getChildren().find($isLinkNode)).toBeUndefined();
    });
  });

  it('typing a long-TLD external URL creates a regular link', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note1');
    const url = 'https://example.technology/';
    await act(async () => {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
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
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${text} `);
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
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, `${url} `);
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
    await typeText(remdo, ' @note2');
    await pressKey(remdo, { key: 'Enter' });

    await selectEntireNote(remdo, 'note2');
    await typeText(remdo, 'renamed note2');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 note2 ' },
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
    await typeText(remdo, ' @note2');
    await typeText(remdo, ' !');

    const picker = document.querySelector('[data-note-link-picker]');
    expect(picker).not.toBeNull();
    expect(document.querySelector('[data-note-link-picker-item]')).toBeNull();
    const emptyRow = document.querySelector('[data-note-link-picker-empty="true"]');
    expect(emptyRow).not.toBeNull();
    expect(emptyRow!.textContent.trim()).toBe('No results...');

    await pressKey(remdo, { key: 'Enter' });
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 @note2 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('keeps filtered results in document order', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note');

    const optionTitles = Array.from(document.querySelectorAll('.note-link-picker__title'), (node) => node.textContent);
    expect(optionTitles).toEqual(['note2', 'note3']);
  });

  it('does not include the current note in picker options', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note');

    const optionTitles = Array.from(document.querySelectorAll('.note-link-picker__title'), (node) => node.textContent);
    expect(optionTitles).toEqual(['note1', 'note3']);
  });

  it('shows the no-results row when the query has no matches', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @missing');

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
    await typeText(remdo, ' @missing');
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 @missing' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('closes link mode on Tab when there are no results and keeps typed text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @missing');
    await pressKey(remdo, { key: 'Tab' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 @missing' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('tracks active option via aria-activedescendant and aria-selected', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note');

    // WAI-ARIA combobox: the role and aria-activedescendant live on the editor
    // host (focus stays there), and aria-controls points at the listbox's id.
    const host = remdo.editor.getRootElement()!;
    const readPicker = () => {
      const listbox = document.querySelector<HTMLElement>('.note-link-picker[role="listbox"]');
      expect(listbox).not.toBeNull();
      const rows = [...document.querySelectorAll<HTMLElement>('[data-note-link-picker-item]')];
      expect(rows).toHaveLength(2);
      return { listbox: listbox!, rows };
    };

    let picker = readPicker();
    expect(host.getAttribute('role')).toBe('combobox');
    expect(host.getAttribute('aria-controls')).toBe(picker.listbox.id);
    expect(picker.listbox.id).not.toBe('');
    expect(picker.rows[0]!.id).not.toBe('');
    expect(picker.rows[1]!.id).not.toBe('');
    expect(host.getAttribute('aria-activedescendant')).toBe(picker.rows[0]!.id);
    expect(picker.rows[0]!.getAttribute('aria-selected')).toBe('true');
    expect(picker.rows[1]!.getAttribute('aria-selected')).toBe('false');

    await pressKey(remdo, { key: 'ArrowDown' });
    picker = readPicker();
    expect(host.getAttribute('aria-activedescendant')).toBe(picker.rows[1]!.id);
    expect(picker.rows[0]!.getAttribute('aria-selected')).toBe('false');
    expect(picker.rows[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('closes link mode on editor blur', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note');
    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();

    const root = remdo.editor.getRootElement();
    expect(root).not.toBeNull();
    root!.dispatchEvent(new FocusEvent('blur'));
    await remdo.waitForSynced();

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 @note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes link mode on outside mouse down', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note');
    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await remdo.waitForSynced();

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 @note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('clamps ArrowUp and ArrowDown picker navigation at boundaries', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @');

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
    await typeText(remdo, ' @note');

    const rows = [...document.querySelectorAll<HTMLElement>('[data-note-link-picker-item]')];
    expect(rows).toHaveLength(2);

    const option = rows[1]!;
    option.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    await remdo.waitForSynced();

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 note3 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('shows minimal ancestor context for duplicate titles', meta({ fixture: 'duplicate-titles' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @task');

    const rows = [...document.querySelectorAll('[data-note-link-picker-item]')];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.querySelector('.note-link-picker__title')?.textContent)).toEqual(['task', 'task']);
    expect(rows.map((row) => row.querySelector('.note-link-picker__context')?.textContent)).toEqual(['note2', 'note4']);
  });

  it(
    'searches the whole document while zoomed',
    meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      await typeText(remdo, ' @note1');
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        {
          noteId: 'note2',
          text: 'note2',
          children: [{ noteId: 'note3', text: 'note3 note1 ' }],
        },
      ]);
    }
  );

  it('closes link mode on Escape and keeps the typed @query', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Escape dismisses the popup without clearing editable text (shared trigger
    // lifecycle, docs/specs/outliner/popups.md). The typed @query stays as text.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note2');
    await pressKey(remdo, { key: 'Escape' });

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 @note2' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('deletes the bare @ on Backspace and closes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Backspace on an empty query is plain editing: it removes the trigger
    // character and ends the session (shared trigger lifecycle).
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @');
    await pressKey(remdo, { key: 'Backspace' });

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('does not open link mode when @ follows non-whitespace text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // The trigger is boundary-gated (shared trigger lifecycle): @ after prose
    // (e.g. an email-like a@b) stays plain text and opens no picker.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '@note2');

    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1@note2' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('does not reopen link mode when the caret returns beside an existing @', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Once closed, an existing @ is plain text: only a fresh @ keypress reopens,
    // never moving the caret back beside it (shared trigger lifecycle).
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @');
    expect(document.querySelector('[data-note-link-picker]')).not.toBeNull();
    await pressKey(remdo, { key: 'Escape' });
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();

    // Move the caret off the @ and back beside it.
    await pressKey(remdo, { key: 'ArrowLeft' });
    await pressKey(remdo, { key: 'ArrowRight' });
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });

  it('does not reopen link mode after Backspace exits empty query', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @');
    await pressKey(remdo, { key: 'Backspace' });
    await typeText(remdo, 'n');

    // The @ was deleted by Backspace; typing 'n' is ordinary text, no reopen.
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 n' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(document.querySelector('[data-note-link-picker]')).toBeNull();
  });
});
