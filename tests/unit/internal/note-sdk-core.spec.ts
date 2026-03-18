import { describe, expect, it } from 'vitest';
import { createUserConfigRootNote } from '@/documents';
import type { UserConfigSource } from '@/documents/contracts';
import { createEditorNotes } from '@/editor/notes';
import type { AdapterNoteSelection, EditorNotesAdapter, NoteRange, PlaceTarget } from '@/editor/notes/sdk-contracts';
import { NoteNotFoundError } from '@/notes/errors';
import type { NoteKind } from '@/notes/contracts';

function createMockAdapterFixture(
  adapterSelection?: AdapterNoteSelection
): {
  adapter: EditorNotesAdapter;
  userConfig: UserConfigSource;
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
  const configNotes = new Map<string, { kind: NoteKind; text: string; children: string[] }>([
    ['user-config', { kind: 'user-config', text: 'User Config', children: ['document-list'] }],
    ['document-list', { kind: 'document-list', text: 'Documents', children: ['main', 'flat'] }],
    ['main', { kind: 'document', text: 'Main', children: [] }],
    ['flat', { kind: 'document', text: 'Flat', children: [] }],
  ]);

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
    userConfig: {
      rootId: () => 'user-config',
      hasNote: (noteId) => configNotes.has(noteId),
      kindOf: (noteId) => {
        const note = configNotes.get(noteId);
        if (!note) {
          throw new NoteNotFoundError(noteId);
        }
        return note.kind;
      },
      textOf: (noteId) => {
        const note = configNotes.get(noteId);
        if (!note) {
          throw new NoteNotFoundError(noteId);
        }
        return note.text;
      },
      childrenOf: (noteId) => {
        const note = configNotes.get(noteId);
        if (!note) {
          throw new NoteNotFoundError(noteId);
        }
        return note.children;
      },
    },
    adapter: {
      docId: () => 'doc-1',
      currentDocumentChildrenIds: () => ['a'],
      selection: () => resolvedSelection,
      createNote: (target, text = '') => {
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
        return noteId;
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
  it('narrows notes by kind and throws on mismatches', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);
    const documentList = createUserConfigRootNote(fixture.userConfig).children()[0]!.as('document-list');
    const note = sdk.note('a');

    expect(documentList.kind()).toBe('document-list');
    expect(documentList.children()[0]!.as('document').text()).toBe('Main');
    expect(note.as('editor-note').attached()).toBe(true);
    expect(() => note.as('document')).toThrow('expected "document"');
  });

  it('lists documents through user-config document-list traversal', () => {
    const fixture = createMockAdapterFixture();
    const documentList = createUserConfigRootNote(fixture.userConfig).children().find((entry) => entry.kind() === 'document-list')!;

    expect(
      documentList.children().filter((entry) => entry.kind() === 'document').map((document) => ({
        id: document.id(),
        kind: document.kind(),
        text: document.text(),
      }))
    ).toEqual([
      { id: 'main', kind: 'document', text: 'Main' },
      { id: 'flat', kind: 'document', text: 'Flat' },
    ]);
  });

  it('reads note data from adapter', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);
    const note = sdk.note('a');

    expect(note.id()).toBe('a');
    expect(note.attached()).toBe(true);
    expect(note.text()).toBe('A');
    expect(note.children().map((child) => child.id())).toEqual(['b', 'c']);
  });

  it('reads current document from adapter', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);
    const document = sdk.currentDocument();

    expect(document.id()).toBe('doc-1');
    expect(document.kind()).toBe('document');
    expect(document.text()).toBe('doc-1');
    expect(document.children().map((note) => note.id())).toEqual(['a']);
  });

  it('reflects selection and defers missing note errors to reads', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);

    expect(sdk.docId()).toBe('doc-1');
    const selection = sdk.selection();
    if (selection.kind !== 'caret') {
      throw new Error(`Expected caret selection, got ${selection.kind}`);
    }
    expect(selection.range.start).toBe('b');
    expect(selection.range.end).toBe('b');
    expect(sdk.indent(selection.range)).toBe(true);
    const missing = sdk.note('missing');
    expect(missing.attached()).toBe(false);
    expect(() => missing.text()).toThrow(NoteNotFoundError);
  });

  it('delegates mutating operations to adapter and preserves no-op booleans', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);

    expect(sdk.outdent({ start: 'a', end: 'a' })).toBe(false);
    expect(sdk.indent({ start: 'b', end: 'b' })).toBe(true);
    expect(sdk.moveUp({ start: 'b', end: 'b' })).toBe(true);
    expect(sdk.moveDown({ start: 'b', end: 'b' })).toBe(true);
  });

  it('creates and places a note, returning note handle', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);

    const placed = sdk.createNote({ before: 'b' }, 'Draft');

    expect(placed.id()).toBe('draft-1');
    expect(placed.text()).toBe('Draft');
  });

  it('delegates place targets in note-id form', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);

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
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);
    const note = sdk.note('b');

    expect(sdk.delete({ start: 'b', end: 'b' })).toBe(true);

    expect(note.attached()).toBe(false);
    expect(() => note.text()).toThrow(NoteNotFoundError);
    expect(() => note.children()).toThrow(NoteNotFoundError);
    expect(() => sdk.indent({ start: 'b', end: 'b' })).toThrow(NoteNotFoundError);
    expect(() => sdk.moveUp({ start: 'b', end: 'b' })).toThrow(NoteNotFoundError);
  });

  it('uses structural selection range for sdk operations', () => {
    const fixture = createMockAdapterFixture({ kind: 'structural', range: { start: 'b', end: 'b' } });
    const sdk = createEditorNotes(fixture.adapter, fixture.userConfig);
    const selection = sdk.selection();
    if (selection.kind !== 'structural') {
      throw new Error(`Expected structural selection, got ${selection.kind}`);
    }

    expect(sdk.moveDown(selection.range)).toBe(true);
  });
});
