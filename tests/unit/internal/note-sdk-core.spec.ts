import { describe, expect, it } from 'vitest';
import { createNoteSdk, NoteNotFoundError } from '@/editor/outline/sdk';
import type { AdapterNoteSelection, NoteRange, NoteSdkAdapter, PlaceTarget } from '@/editor/outline/sdk/contracts';

function createMockAdapterFixture(
  adapterSelection?: AdapterNoteSelection
): {
  adapter: NoteSdkAdapter;
  notes: Map<string, { text: string; children: string[] }>;
  placeCalls: Array<{ range: NoteRange; target: PlaceTarget }>;
} {
  const resolvedSelection = adapterSelection ?? { kind: 'caret', range: { start: 'b', end: 'b' } };
  const notes = new Map<string, { text: string; children: string[] }>([
    ['a', { text: 'A', children: ['b', 'c'] }],
    ['b', { text: 'B', children: [] }],
    ['c', { text: 'C', children: [] }],
  ]);
  const placeCalls: Array<{ range: NoteRange; target: PlaceTarget }> = [];
  let nextDraftId = 1;

  const requireNote = (noteId: string): { text: string; children: string[] } => {
    const note = notes.get(noteId);
    if (!note) {
      throw new NoteNotFoundError(noteId);
    }
    return note;
  };

  const requireRange = (range: NoteRange): void => {
    requireNote(range.start);
    requireNote(range.end);
  };

  return {
    notes,
    placeCalls,
    adapter: {
      docId: () => 'doc-1',
      selection: () => resolvedSelection,
      createNote: (text = '') => {
        let placed = false;
        return {
          place: (target) => {
            if (placed) {
              throw new Error('Draft note already placed');
            }
            if ('parent' in target) {
              requireNote(target.parent);
            } else if ('before' in target) {
              requireNote(target.before);
            } else {
              requireNote(target.after);
            }

            const noteId = `draft-${nextDraftId}`;
            nextDraftId += 1;
            notes.set(noteId, { text, children: [] });
            placeCalls.push({ range: { start: noteId, end: noteId }, target });
            placed = true;
            return noteId;
          },
        };
      },
      hasNote: (noteId) => notes.has(noteId),
      isBounded: (noteId) => notes.has(noteId),
      textOf: (noteId) => requireNote(noteId).text,
      childrenOf: (noteId) => requireNote(noteId).children,
      delete: (range) => {
        requireRange(range);
        notes.delete(range.start);
        notes.delete(range.end);
        return true;
      },
      place: (range, target) => {
        requireRange(range);
        if ('parent' in target) {
          requireNote(target.parent);
        } else if ('before' in target) {
          requireNote(target.before);
        } else {
          requireNote(target.after);
        }
        placeCalls.push({ range, target });
      },
      indent: (range) => {
        requireRange(range);
        return true;
      },
      outdent: (range) => {
        requireRange(range);
        return range.start !== 'a' || range.end !== 'a';
      },
      moveUp: (range) => {
        requireRange(range);
        return range.start === 'b' && range.end === 'b';
      },
      moveDown: (range) => {
        requireRange(range);
        return range.start === 'b' && range.end === 'b';
      },
    },
  };
}

describe('note sdk core', () => {
  it('reads note data from adapter', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.note('a');

    expect(note.id()).toBe('a');
    expect(note.bounded()).toBe(true);
    expect(note.text()).toBe('A');
    expect(note.children().map((child) => child.id())).toEqual(['b', 'c']);
  });

  it('reflects selection and throws for missing notes', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    expect(sdk.docId()).toBe('doc-1');
    const selection = sdk.selection();
    if (selection.kind !== 'caret') {
      throw new Error(`Expected caret selection, got ${selection.kind}`);
    }
    expect(selection.range.start).toBe('b');
    expect(selection.range.end).toBe('b');
    expect(sdk.indent(selection.range)).toBe(true);
    expect(() => sdk.note('missing')).toThrowError(NoteNotFoundError);
  });

  it('delegates mutating operations to adapter and preserves no-op booleans', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    expect(sdk.outdent({ start: 'a', end: 'a' })).toBe(false);
    expect(sdk.indent({ start: 'b', end: 'b' })).toBe(true);
    expect(sdk.moveUp({ start: 'b', end: 'b' })).toBe(true);
    expect(sdk.moveDown({ start: 'b', end: 'b' })).toBe(true);
  });

  it('creates a draft and returns note handle after place', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    const draft = sdk.createNote('Draft');
    const placed = draft.place({ before: 'b' });

    expect(placed.id()).toBe('draft-1');
    expect(placed.text()).toBe('Draft');
  });

  it('delegates place targets in note-id form', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    expect(() => sdk.place({ start: 'c', end: 'c' }, { before: 'b' })).not.toThrow();
    expect(() => sdk.place({ start: 'c', end: 'c' }, { after: 'b' })).not.toThrow();
    expect(() => sdk.place({ start: 'c', end: 'c' }, { parent: 'a', index: -1 })).not.toThrow();

    expect(fixture.placeCalls).toEqual([
      { range: { start: 'c', end: 'c' }, target: { before: 'b' } },
      { range: { start: 'c', end: 'c' }, target: { after: 'b' } },
      { range: { start: 'c', end: 'c' }, target: { parent: 'a', index: -1 } },
    ]);
  });

  it('throws from reads and operations once the note is removed', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.note('b');

    expect(sdk.delete({ start: 'b', end: 'b' })).toBe(true);

    expect(note.bounded()).toBe(false);
    expect(() => note.text()).toThrowError(NoteNotFoundError);
    expect(() => note.children()).toThrowError(NoteNotFoundError);
    expect(() => sdk.indent({ start: 'b', end: 'b' })).toThrowError(NoteNotFoundError);
    expect(() => sdk.moveUp({ start: 'b', end: 'b' })).toThrowError(NoteNotFoundError);
  });

  it('uses structural selection range for sdk operations', () => {
    const fixture = createMockAdapterFixture({ kind: 'structural', range: { start: 'b', end: 'b' } });
    const sdk = createNoteSdk(fixture.adapter);
    const selection = sdk.selection();
    if (selection.kind !== 'structural') {
      throw new Error(`Expected structural selection, got ${selection.kind}`);
    }

    expect(sdk.moveDown(selection.range)).toBe(true);
  });
});
