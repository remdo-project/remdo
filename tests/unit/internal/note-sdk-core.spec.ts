import { describe, expect, it } from 'vitest';
import { createNoteSdk, NoteNotFoundError } from '@/editor/outline/sdk';
import type { AdapterNoteSelection, NoteSdkAdapter } from '@/editor/outline/sdk/contracts';

function createMockAdapterFixture(
  adapterSelection?: AdapterNoteSelection
): { adapter: NoteSdkAdapter; notes: Map<string, { text: string; children: string[] }> } {
  const resolvedSelection = adapterSelection ?? { kind: 'caret', headIds: ['b'] };
  const notes = new Map<string, { text: string; children: string[] }>([
    ['a', { text: 'A', children: ['b', 'c'] }],
    ['b', { text: 'B', children: [] }],
    ['c', { text: 'C', children: [] }],
  ]);
  const requireNote = (noteId: string): { text: string; children: string[] } => {
    const note = notes.get(noteId);
    if (!note) {
      throw new NoteNotFoundError(noteId);
    }
    return note;
  };
  const requireNotes = (noteIds: readonly string[]): void => {
    for (const noteId of noteIds) {
      requireNote(noteId);
    }
  };

  return {
    notes,
    adapter: {
      docId: () => 'doc-1',
      adapterSelection: () => resolvedSelection,
      hasNote: (noteId) => notes.has(noteId),
      textOf: (noteId) => requireNote(noteId).text,
      childrenOf: (noteId) => requireNote(noteId).children,
      indentNotes: (noteIds) => {
        requireNotes(noteIds);
        return true;
      },
      outdentNotes: (noteIds) => {
        requireNotes(noteIds);
        return noteIds.every((noteId) => noteId !== 'a');
      },
      moveNotesUp: (noteIds) => {
        requireNotes(noteIds);
        return noteIds.length === 1 && noteIds[0] === 'b';
      },
      moveNotesDown: (noteIds) => {
        requireNotes(noteIds);
        return noteIds.length === 1 && noteIds[0] === 'b';
      },
    },
  };
}

describe('note sdk core', () => {
  it('builds note handles from adapter data', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.get('a');

    expect(note.id()).toBe('a');
    expect(note.text()).toBe('A');
    expect(note.children().map((child) => child.id())).toEqual(['b', 'c']);
  });

  it('reflects selection and throws for missing notes', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    expect(sdk.docId()).toBe('doc-1');
    const selection = sdk.selection();
    expect(selection.kind).toBe('caret');
    const caret = selection.as('caret');
    expect(caret.heads().map((head) => head.id())).toEqual(['b']);
    expect(sdk.indent(selection.heads())).toBe(true);
    expect(() => selection.as('structural')).toThrow('Expected structural selection, got caret');
    expect(() => sdk.get('missing')).toThrowError(NoteNotFoundError);
  });

  it('delegates mutating operations to adapter and preserves no-op booleans', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const a = sdk.get('a');
    const b = sdk.get('b');

    expect(a.outdent()).toBe(false);
    expect(b.indent()).toBe(true);
    expect(b.moveUp()).toBe(true);
    expect(b.moveDown()).toBe(true);
  });

  it('throws from handle operations once the note is removed', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.get('b');

    fixture.notes.delete('b');

    expect(() => note.text()).toThrowError(NoteNotFoundError);
    expect(() => note.children()).toThrowError(NoteNotFoundError);
    expect(() => note.indent()).toThrowError(NoteNotFoundError);
    expect(() => note.moveUp()).toThrowError(NoteNotFoundError);
  });

  it('delegates sdk note operations using structural selection heads', () => {
    const fixture = createMockAdapterFixture({ kind: 'structural', headIds: ['b'] });
    const sdk = createNoteSdk(fixture.adapter);
    const selection = sdk.selection().as('structural');

    expect(sdk.indent(selection.heads())).toBe(true);
    expect(sdk.outdent(selection.heads())).toBe(true);
    expect(sdk.moveUp(selection.heads())).toBe(true);
    expect(sdk.moveDown(selection.heads())).toBe(true);
  });
});
