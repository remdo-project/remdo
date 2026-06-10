import { act } from '@testing-library/react';
import type { SerializedLexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $findNoteById } from '#client/editor/outline/note-traversal';
import type { SerializedDateNode } from '#client/editor/runtime/date-node';
import { $createDateNode, $isDateNode } from '#client/editor/runtime/date-node';
import { findSerializedNode, meta, placeCaretAtNote, pressKey, typeText } from '#tests';

function findSerializedDateNode(nodes: SerializedLexicalNode[] | undefined): SerializedDateNode | null {
  return findSerializedNode(nodes, (node): node is SerializedDateNode => node.type === 'date');
}

async function clickElement(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function mouseDownElement(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

async function clickPickerDay(isoDate: string) {
  const day = document.querySelector(`[data-date-picker-day="${isoDate}"]`);
  expect(day).not.toBeNull();
  await clickElement(day!);
}

describe('date nodes', () => {
  it('serializes date identity separately from the readable label', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-10');
      expect(dateNode.getTextContent()).toBe('Jun 10, 2026');
      expect(dateNode.isToken()).toBe(true);
    });

    const dateNode = findSerializedDateNode(remdo.getEditorState().root.children);
    expect(dateNode).toMatchObject({
      isoDate: '2026-06-10',
      mode: 'token',
      text: 'Jun 10, 2026',
      type: 'date',
    });
  });

  it('inserts a date node from the ! picker', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');

    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    await clickPickerDay('2026-06-10');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 Jun 10, 2026 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-10');
      expect(dateNode.getTextContent()).toBe('Jun 10, 2026');
    });
  });

  it('does not open the picker when ! follows non-whitespace text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, 'done!');

    // Mirrors Lexical typeahead trigger boundaries, avoiding prose punctuation false positives.
    // https://lexical.dev/docs/react/plugins
    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1done!' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('opens the picker when ! follows whitespace', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');

    // Mirrors Lexical typeahead trigger boundaries: start, whitespace, or opening punctuation.
    // https://lexical.dev/docs/react/plugins
    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('opens the picker when ! starts a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 0);
    await typeText(remdo, '!');

    // Mirrors Lexical typeahead trigger boundaries: start, whitespace, or opening punctuation.
    // https://lexical.dev/docs/react/plugins
    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: '!note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes the picker when typing query text after !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, '!t');

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1!t' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('updates an existing date node when clicked', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    const dateElement = document.querySelector('[data-date-node-key]');
    expect(dateElement).not.toBeNull();
    await clickElement(dateElement!);

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    await clickPickerDay('2026-06-11');

    const updatedDateElement = document.querySelector('[data-date-node-key]');
    expect(updatedDateElement).toHaveAttribute('data-iso-date', '2026-06-11');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'Jun 11, 2026' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-11');
      expect(dateNode.getTextContent()).toBe('Jun 11, 2026');
    });
  });

  it('closes insert picker on outside click while keeping the typed !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');

    expect(document.querySelector('[data-date-picker-mode="insert"]')).not.toBeNull();
    await mouseDownElement(remdo.editor.getRootElement()!);

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('closes edit picker on outside click without changing the date', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear();
      note.append($createDateNode('2026-06-10'));
    });

    const dateElement = document.querySelector('[data-date-node-key]');
    expect(dateElement).not.toBeNull();
    await clickElement(dateElement!);

    expect(document.querySelector('[data-date-picker-mode="edit"]')).not.toBeNull();
    await mouseDownElement(document.body);

    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'Jun 10, 2026' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    remdo.validate(() => {
      const note = $findNoteById('note1')!;
      const dateNode = note.getChildren().find($isDateNode)!;
      expect(dateNode.getIsoDate()).toBe('2026-06-10');
    });
  });

  it('closes insert picker on Escape while keeping the typed !', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    await pressKey(remdo, { key: 'Escape' });

    // Escape dismisses an open popup without clearing editable text.
    // https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 !' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('lets Backspace delete the typed ! while closing the insert picker', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' !');
    await pressKey(remdo, { key: 'Backspace' });

    // Backspace in editable popup flows deletes the character before the cursor.
    // https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
    expect(document.querySelector('[data-date-picker]')).toBeNull();
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1 ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});
