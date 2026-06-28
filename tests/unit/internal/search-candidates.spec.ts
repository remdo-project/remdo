import { describe, expect, it, vi } from 'vitest';
import { meta } from '#tests';
import { createLexicalEditorNotes } from '#client/editor/note-sdk-adapters';
import type {
  BodyNote,
  CollectionNote,
  DocumentNote,
  DocumentAccessNote,
  DocumentSourceNote,
  EditorNote,
  Note,
  NoteKind,
  NoteListType,
  SourceServerNote,
  UserDataNote,
} from '#note-sdk';
import { collectDocumentSearchResults } from '#client/editor/search/search-candidates';

const ALL = { query: '', limit: Number.MAX_SAFE_INTEGER, childPreviewLimit: 2 };

function createMockNoteAs(noteId: string, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
  function asNote(kindToMatch: 'body'): BodyNote;
  function asNote(kindToMatch: 'user-data'): UserDataNote;
  function asNote(kindToMatch: 'document'): DocumentNote;
  function asNote(kindToMatch: 'document-access'): DocumentAccessNote;
  function asNote(kindToMatch: 'document-source'): DocumentSourceNote;
  function asNote(kindToMatch: 'collection'): CollectionNote;
  function asNote(kindToMatch: 'source-server'): SourceServerNote;
  function asNote(kindToMatch: NoteKind): Note;
  function asNote(kindToMatch: NoteKind): Note {
    const actualKind = kind();
    if (actualKind !== kindToMatch) {
      throw new Error(`Note "${noteId}" is "${actualKind}", expected "${kindToMatch}".`);
    }
    return self();
  }
  return asNote;
}

function createMockEditorNote(
  id: string,
  text: string,
  children: EditorNote[] = [],
  options: { listType?: NoteListType; checked?: boolean } = {}
): EditorNote {
  const kind = () => 'editor-note' as const;
  const parent: EditorNote | null = null;
  const note: EditorNote = {
    id: () => id,
    kind,
    attached: () => true,
    text: () => text,
    listType: () => options.listType ?? 'bullet',
    checked: () => options.checked ?? false,
    parent: () => parent,
    children: () => children,
    create: () => {
      throw new Error('Editor note creation is not used in search candidate tests.');
    },
    body: () => null,
    as: createMockNoteAs(id, kind, () => note),
  };
  for (const child of children) {
    (child as { parent: () => EditorNote | null }).parent = () => note;
  }
  return note;
}

function createMockDocumentNote(children: EditorNote[]): DocumentNote {
  const kind = () => 'document' as const;
  const accessKind = () => 'collection' as const;
  const access: CollectionNote<DocumentAccessNote> = {
    id: () => 'main/access',
    kind: accessKind,
    text: () => 'Access',
    children: () => [],
    byId: () => null,
    as: createMockNoteAs('main/access', accessKind, () => access),
  };
  const note: DocumentNote = {
    id: () => 'main',
    kind,
    text: () => 'Main',
    access: () => access,
    children: () => children,
    create: () => {
      throw new Error('Document note creation is not used in search candidate tests.');
    },
    shareable: () => false,
    shareWith: async () => {
      throw new Error('Document sharing is not used in search candidate tests.');
    },
    as: createMockNoteAs('main', kind, () => note),
  };
  return note;
}

function createDeepChain(depth: number): EditorNote {
  let current = createMockEditorNote(`deep-${depth - 1}`, `Deep ${depth - 1}`);

  for (let index = depth - 2; index >= 0; index -= 1) {
    current = createMockEditorNote(`deep-${index}`, `Deep ${index}`, [current]);
  }

  return current;
}

describe('search candidates', () => {
  it('flattens root notes and descendants in pre-order', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const { flatResults, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    }, ALL);

    expect(hasMore).toBe(false);
    expect(flatResults).toEqual([
      { noteId: 'top', text: 'Top', listType: 'bullet', checked: false, pathText: ['Top'] },
      { noteId: 'child-a', text: 'Child A', listType: 'bullet', checked: false, pathText: ['Top', 'Child A'] },
      { noteId: 'child-b', text: 'Child B', listType: 'bullet', checked: false, pathText: ['Top', 'Child B'] },
      { noteId: 'leaf', text: 'Leaf', listType: 'bullet', checked: false, pathText: ['Top', 'Child B', 'Leaf'] },
      { noteId: 'sibling', text: 'Sibling', listType: 'bullet', checked: false, pathText: ['Sibling'] },
    ]);
  });

  it('returns empty results when there are no root notes', () => {
    const { flatResults, childPreviewByNoteId, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([]),
    }, ALL);

    expect(flatResults).toEqual([]);
    expect(childPreviewByNoteId).toEqual({});
    expect(hasMore).toBe(false);
  });

  it('builds a child preview with the first N children and the exact total count', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
      createMockEditorNote('child-c', 'Child C'),
    ]);

    const { childPreviewByNoteId } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([top]),
    }, ALL);

    // childPreviewLimit is 2, but totalCount reflects all three children so the
    // row can show "+1 more".
    expect(childPreviewByNoteId.top).toEqual({
      items: [
        { noteId: 'child-a', text: 'Child A', listType: 'bullet', checked: false },
        { noteId: 'child-b', text: 'Child B', listType: 'bullet', checked: false },
      ],
      totalCount: 3,
    });
    expect(childPreviewByNoteId['child-b']).toEqual({
      items: [{ noteId: 'leaf', text: 'Leaf', listType: 'bullet', checked: false }],
      totalCount: 1,
    });
    expect(childPreviewByNoteId['child-a']).toEqual({ items: [], totalCount: 0 });
  });

  it('captures list type and checked state per child-preview item', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('step-1', 'Step one', [], { listType: 'number' }),
      createMockEditorNote('done', 'Done item', [], { listType: 'check', checked: true }),
    ]);

    const { childPreviewByNoteId } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([top]),
    }, ALL);

    expect(childPreviewByNoteId.top!.items).toEqual([
      { noteId: 'step-1', text: 'Step one', listType: 'number', checked: false },
      { noteId: 'done', text: 'Done item', listType: 'check', checked: true },
    ]);
  });

  it('filters to query matches in document order', () => {
    const top = createMockEditorNote('Work', 'Work', [
      createMockEditorNote('roadmap', 'Roadmap'),
      createMockEditorNote('groceries', 'Groceries'),
    ]);

    const { flatResults, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([top]),
    }, { ...ALL, query: 'road' });

    expect(hasMore).toBe(false);
    expect(flatResults.map((result) => result.noteId)).toEqual(['roadmap']);
  });

  it('caps results at the limit and flags hasMore without returning the extra match', () => {
    const notes = Array.from({ length: 5 }, (_unused, index) =>
      createMockEditorNote(`n${index}`, `Note ${index}`));

    const { flatResults, childPreviewByNoteId, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote(notes),
    }, { ...ALL, limit: 3 });

    expect(hasMore).toBe(true);
    expect(flatResults.map((result) => result.noteId)).toEqual(['n0', 'n1', 'n2']);
    // The peeked fourth match is not built into the preview map.
    expect(Object.keys(childPreviewByNoteId)).toEqual(['n0', 'n1', 'n2']);
  });

  it('does not read children of the one-past-limit peeked match', () => {
    // The peeked match only sets hasMore; reading its children (which maps the
    // whole nested list for a large parent via the SDK) would be wasted work.
    const notes = Array.from({ length: 4 }, (_unused, index) =>
      createMockEditorNote(`n${index}`, `Note ${index}`));
    const peeked = notes[3]!;
    const childrenSpy = vi.spyOn(peeked, 'children');

    const { hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote(notes),
    }, { ...ALL, limit: 3 });

    expect(hasMore).toBe(true);
    expect(childrenSpy).not.toHaveBeenCalled();
  });

  it('does not flag hasMore when matches exactly fill the limit', () => {
    const notes = Array.from({ length: 3 }, (_unused, index) =>
      createMockEditorNote(`n${index}`, `Note ${index}`));

    const { flatResults, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote(notes),
    }, { ...ALL, limit: 3 });

    expect(hasMore).toBe(false);
    expect(flatResults).toHaveLength(3);
  });

  it('reads note-head text only from the real lexical adapter shape', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const result = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return collectDocumentSearchResults(sdk, ALL);
    });

    expect(result.flatResults).toEqual([
      { noteId: 'note1', text: 'note1', listType: 'bullet', checked: false, pathText: ['note1'] },
      { noteId: 'note2', text: 'note2', listType: 'bullet', checked: false, pathText: ['note1', 'note2'] },
      { noteId: 'note3', text: 'note3', listType: 'bullet', checked: false, pathText: ['note3'] },
    ]);
    expect(result.childPreviewByNoteId).toEqual({
      note1: { items: [{ noteId: 'note2', text: 'note2', listType: 'bullet', checked: false }], totalCount: 1 },
      note2: { items: [], totalCount: 0 },
      note3: { items: [], totalCount: 0 },
    });
  });

  it('collects deep single-child chains without stack overflow', () => {
    const depth = 12_000;
    const root = createDeepChain(depth);
    const sdk = {
      currentDocument: () => createMockDocumentNote([root]),
    };

    const { flatResults, childPreviewByNoteId } = collectDocumentSearchResults(sdk, ALL);

    expect(flatResults).toHaveLength(depth);
    expect(flatResults[0]).toEqual({ noteId: 'deep-0', text: 'Deep 0', listType: 'bullet', checked: false, pathText: ['Deep 0'] });
    expect(flatResults.at(-1)).toEqual({
      noteId: `deep-${depth - 1}`,
      text: `Deep ${depth - 1}`,
      listType: 'bullet',
      checked: false,
      pathText: Array.from({ length: depth }, (_unused, index) => `Deep ${index}`),
    });
    expect(childPreviewByNoteId['deep-0']).toEqual({
      items: [{ noteId: 'deep-1', text: 'Deep 1', listType: 'bullet', checked: false }],
      totalCount: 1,
    });
    expect(childPreviewByNoteId[`deep-${depth - 1}`]).toEqual({ items: [], totalCount: 0 });
  });
});
