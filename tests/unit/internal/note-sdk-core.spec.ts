import { describe, expect, it } from 'vitest';
import { createNoteSdk, NoteNotFoundError } from '@/editor/outline/sdk';
import type { AdapterNoteSelection, NoteSdkAdapter } from '@/editor/outline/sdk/contracts';

function createMockAdapterFixture(
  adapterSelection?: AdapterNoteSelection
): { adapter: NoteSdkAdapter; notes: Map<string, { text: string; children: string[] }> } {
  const resolvedSelection = adapterSelection ?? { kind: 'caret', heads: ['b'] };
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
      delete: (noteIds) => {
        requireNotes(noteIds);
        for (const noteId of noteIds) {
          notes.delete(noteId);
        }
        return true;
      },
      indent: (noteIds) => {
        requireNotes(noteIds);
        return true;
      },
      outdent: (noteIds) => {
        requireNotes(noteIds);
        return noteIds.every((noteId) => noteId !== 'a');
      },
      moveUp: (noteIds) => {
        requireNotes(noteIds);
        return noteIds.length === 1 && noteIds[0] === 'b';
      },
      moveDown: (noteIds) => {
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
    expect(selection.heads().map((head) => head.id())).toEqual(['b']);
    expect(sdk.indent(selection.heads())).toBe(true);
    expect(() => sdk.get('missing')).toThrowError(NoteNotFoundError);
  });

  it('delegates mutating operations to adapter and preserves no-op booleans', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const a = sdk.get('a');
    const b = sdk.get('b');

    expect(sdk.outdent([a])).toBe(false);
    expect(sdk.indent([b])).toBe(true);
    expect(sdk.moveUp([b])).toBe(true);
    expect(sdk.moveDown([b])).toBe(true);
  });

  it('throws from handle operations once the note is removed', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.get('b');

    expect(sdk.delete([note])).toBe(true);

    expect(() => note.text()).toThrowError(NoteNotFoundError);
    expect(() => note.children()).toThrowError(NoteNotFoundError);
    expect(() => sdk.indent([note])).toThrowError(NoteNotFoundError);
    expect(() => sdk.moveUp([note])).toThrowError(NoteNotFoundError);
  });

  it('uses structural selection heads for sdk operations', () => {
    const fixture = createMockAdapterFixture({ kind: 'structural', heads: ['b'] });
    const sdk = createNoteSdk(fixture.adapter);
    const selection = sdk.selection();
    expect(selection.kind).toBe('structural');

    expect(sdk.moveDown(selection.heads())).toBe(true);
  });
});
