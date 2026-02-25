import { describe, expect, it } from 'vitest';
import { createNoteSdk, NoteNotFoundError } from '@/editor/outline/sdk';
import type { AdapterNoteSelection, MoveTarget, NoteRange, NoteSdkAdapter } from '@/editor/outline/sdk/contracts';

function createMockAdapterFixture(
  adapterSelection?: AdapterNoteSelection
): {
  adapter: NoteSdkAdapter;
  notes: Map<string, { text: string; children: string[] }>;
  moveCalls: Array<{ range: NoteRange; target: MoveTarget }>;
} {
  const resolvedSelection = adapterSelection ?? { kind: 'caret', range: { start: 'b', end: 'b' } };
  const notes = new Map<string, { text: string; children: string[] }>([
    ['a', { text: 'A', children: ['b', 'c'] }],
    ['b', { text: 'B', children: [] }],
    ['c', { text: 'C', children: [] }],
  ]);
  const moveCalls: Array<{ range: NoteRange; target: MoveTarget }> = [];

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
    moveCalls,
    adapter: {
      docId: () => 'doc-1',
      selection: () => resolvedSelection,
      hasNote: (noteId) => notes.has(noteId),
      textOf: (noteId) => requireNote(noteId).text,
      childrenOf: (noteId) => requireNote(noteId).children,
      delete: (range) => {
        requireRange(range);
        notes.delete(range.start);
        notes.delete(range.end);
        return true;
      },
      move: (range, target) => {
        requireRange(range);
        if ('parent' in target) {
          requireNote(target.parent);
        } else if ('before' in target) {
          requireNote(target.before);
        } else {
          requireNote(target.after);
        }
        moveCalls.push({ range, target });
        return true;
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

  it('delegates move targets in note-id form', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    expect(sdk.move({ start: 'c', end: 'c' }, { before: 'b' })).toBe(true);
    expect(sdk.move({ start: 'c', end: 'c' }, { after: 'b' })).toBe(true);
    expect(sdk.move({ start: 'c', end: 'c' }, { parent: 'a', index: -1 })).toBe(true);

    expect(fixture.moveCalls).toEqual([
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
