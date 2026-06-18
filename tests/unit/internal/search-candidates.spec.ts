import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { createLexicalEditorNotes } from '#client/editor/note-sdk-adapters';
import type {
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
import {
  collectAncestorPathMap,
  collectChildCandidateMap,
  collectSearchCandidates,
  collectSearchCandidateSnapshot,
  ROOT_SEARCH_SCOPE_ID,
} from '#client/editor/search/search-candidates';

function createMockNoteAs(noteId: string, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
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
  const note: EditorNote = {
    id: () => id,
    kind,
    attached: () => true,
    text: () => text,
    listType: () => options.listType ?? 'bullet',
    checked: () => options.checked ?? false,
    children: () => children,
    create: () => {
      throw new Error('Editor note creation is not used in search candidate tests.');
    },
    as: createMockNoteAs(id, kind, () => note),
  };
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

    const candidates = collectSearchCandidates({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(candidates).toEqual([
      { noteId: 'top', text: 'Top', listType: 'bullet', checked: false },
      { noteId: 'child-a', text: 'Child A', listType: 'bullet', checked: false },
      { noteId: 'child-b', text: 'Child B', listType: 'bullet', checked: false },
      { noteId: 'leaf', text: 'Leaf', listType: 'bullet', checked: false },
      { noteId: 'sibling', text: 'Sibling', listType: 'bullet', checked: false },
    ]);
  });

  it('returns an empty list when there are no root notes', () => {
    const candidates = collectSearchCandidates({
      currentDocument: () => createMockDocumentNote([]),
    });

    expect(candidates).toEqual([]);
  });

  it('stores slash-root candidates under the synthetic root scope key', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const childCandidateMap = collectChildCandidateMap({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(childCandidateMap[ROOT_SEARCH_SCOPE_ID]).toEqual([
      { noteId: 'top', text: 'Top', listType: 'bullet', checked: false },
      { noteId: 'sibling', text: 'Sibling', listType: 'bullet', checked: false },
    ]);
  });

  it('collects per-note direct children for slash descent mode', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const childCandidateMap = collectChildCandidateMap({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(childCandidateMap).toEqual({
      [ROOT_SEARCH_SCOPE_ID]: [
        { noteId: 'top', text: 'Top', listType: 'bullet', checked: false },
        { noteId: 'sibling', text: 'Sibling', listType: 'bullet', checked: false },
      ],
      top: [
        { noteId: 'child-a', text: 'Child A', listType: 'bullet', checked: false },
        { noteId: 'child-b', text: 'Child B', listType: 'bullet', checked: false },
      ],
      'child-a': [],
      'child-b': [{ noteId: 'leaf', text: 'Leaf', listType: 'bullet', checked: false }],
      leaf: [],
      sibling: [],
    });
  });

  it('captures list type and checked state per candidate', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('step-1', 'Step one', [], { listType: 'number' }),
      createMockEditorNote('done', 'Done item', [], { listType: 'check', checked: true }),
    ]);

    const childCandidateMap = collectChildCandidateMap({
      currentDocument: () => createMockDocumentNote([top]),
    });

    expect(childCandidateMap.top).toEqual([
      { noteId: 'step-1', text: 'Step one', listType: 'number', checked: false },
      { noteId: 'done', text: 'Done item', listType: 'check', checked: true },
    ]);
  });

  it('maps each note to its root-to-note inclusive ancestor path', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const ancestorPathMap = collectAncestorPathMap({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(ancestorPathMap).toEqual({
      top: [{ noteId: 'top', label: 'Top' }],
      'child-a': [
        { noteId: 'top', label: 'Top' },
        { noteId: 'child-a', label: 'Child A' },
      ],
      'child-b': [
        { noteId: 'top', label: 'Top' },
        { noteId: 'child-b', label: 'Child B' },
      ],
      leaf: [
        { noteId: 'top', label: 'Top' },
        { noteId: 'child-b', label: 'Child B' },
        { noteId: 'leaf', label: 'Leaf' },
      ],
      sibling: [{ noteId: 'sibling', label: 'Sibling' }],
    });
  });

  it('reads note-head text only from the real lexical adapter shape', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const result = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return {
        allCandidates: collectSearchCandidates(sdk),
        childCandidateMap: collectChildCandidateMap(sdk),
      };
    });

    expect(result.allCandidates).toEqual([
      { noteId: 'note1', text: 'note1', listType: 'bullet', checked: false },
      { noteId: 'note2', text: 'note2', listType: 'bullet', checked: false },
      { noteId: 'note3', text: 'note3', listType: 'bullet', checked: false },
    ]);
    expect(result.childCandidateMap).toEqual({
      [ROOT_SEARCH_SCOPE_ID]: [
        { noteId: 'note1', text: 'note1', listType: 'bullet', checked: false },
        { noteId: 'note3', text: 'note3', listType: 'bullet', checked: false },
      ],
      note1: [{ noteId: 'note2', text: 'note2', listType: 'bullet', checked: false }],
      note2: [],
      note3: [],
    });
  });

  it('collects deep single-child chains without stack overflow', () => {
    const depth = 12_000;
    const root = createDeepChain(depth);
    const sdk = {
      currentDocument: () => createMockDocumentNote([root]),
    };

    const { allCandidates, childCandidateMap, ancestorPathMap } = collectSearchCandidateSnapshot(sdk);

    expect(ancestorPathMap[`deep-${depth - 1}`]).toHaveLength(depth);
    expect(allCandidates).toHaveLength(depth);
    expect(allCandidates[0]).toEqual({ noteId: 'deep-0', text: 'Deep 0', listType: 'bullet', checked: false });
    expect(allCandidates.at(-1)).toEqual({
      noteId: `deep-${depth - 1}`,
      text: `Deep ${depth - 1}`,
      listType: 'bullet',
      checked: false,
    });
    expect(childCandidateMap[ROOT_SEARCH_SCOPE_ID]).toEqual([{ noteId: 'deep-0', text: 'Deep 0', listType: 'bullet', checked: false }]);
    expect(childCandidateMap['deep-0']).toEqual([{ noteId: 'deep-1', text: 'Deep 1', listType: 'bullet', checked: false }]);
    expect(childCandidateMap[`deep-${depth - 1}`]).toEqual([]);
  });

  it('single-pass snapshot matches the three standalone collectors', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A', [], { listType: 'number' }),
      createMockEditorNote('child-b', 'Child B', [
        createMockEditorNote('leaf', 'Leaf', [], { listType: 'check', checked: true }),
      ]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');
    const sdk = { currentDocument: () => createMockDocumentNote([top, sibling]) };

    expect(collectSearchCandidateSnapshot(sdk)).toEqual({
      allCandidates: collectSearchCandidates(sdk),
      childCandidateMap: collectChildCandidateMap(sdk),
      ancestorPathMap: collectAncestorPathMap(sdk),
    });
  });

  it('single-pass snapshot handles an empty document', () => {
    const sdk = { currentDocument: () => createMockDocumentNote([]) };
    expect(collectSearchCandidateSnapshot(sdk)).toEqual({
      allCandidates: [],
      childCandidateMap: { [ROOT_SEARCH_SCOPE_ID]: [] },
      ancestorPathMap: {},
    });
  });
});
