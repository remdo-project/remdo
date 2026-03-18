import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { createLexicalEditorNotes } from '@/editor/notes';
import type { DocumentListNote, DocumentNote, UserConfigNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type { Note, NoteKind } from '@/notes/contracts';
import {
  collectChildCandidateMapFromSdk,
  collectSearchCandidatesFromSdk,
  ROOT_SEARCH_SCOPE_ID,
} from '@/editor/search/sdk-search-candidates';

function createMockNoteAs(noteId: string, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
  function asNote(kindToMatch: 'user-config'): UserConfigNote;
  function asNote(kindToMatch: 'document-list'): DocumentListNote;
  function asNote(kindToMatch: 'document'): DocumentNote;
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
  children: EditorNote[] = []
): EditorNote {
  const kind = () => 'editor-note' as const;
  const note: EditorNote = {
    id: () => id,
    kind,
    attached: () => true,
    text: () => text,
    children: () => children,
    as: createMockNoteAs(id, kind, () => note),
  };
  return note;
}

function createMockDocumentNote(children: EditorNote[]): DocumentNote {
  const kind = () => 'document' as const;
  const note: DocumentNote = {
    id: () => 'main',
    kind,
    text: () => 'Main',
    children: () => children,
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

describe('sdk search candidates', () => {
  it('flattens root notes and descendants in pre-order', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const candidates = collectSearchCandidatesFromSdk({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(candidates).toEqual([
      { noteId: 'top', text: 'Top' },
      { noteId: 'child-a', text: 'Child A' },
      { noteId: 'child-b', text: 'Child B' },
      { noteId: 'leaf', text: 'Leaf' },
      { noteId: 'sibling', text: 'Sibling' },
    ]);
  });

  it('returns an empty list when there are no root notes', () => {
    const candidates = collectSearchCandidatesFromSdk({
      currentDocument: () => createMockDocumentNote([]),
    });

    expect(candidates).toEqual([]);
  });

  it('stores slash-root candidates under the synthetic root scope key', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const childCandidateMap = collectChildCandidateMapFromSdk({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(childCandidateMap[ROOT_SEARCH_SCOPE_ID]).toEqual([
      { noteId: 'top', text: 'Top' },
      { noteId: 'sibling', text: 'Sibling' },
    ]);
  });

  it('collects per-note direct children for slash descent mode', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const childCandidateMap = collectChildCandidateMapFromSdk({
      currentDocument: () => createMockDocumentNote([top, sibling]),
    });

    expect(childCandidateMap).toEqual({
      [ROOT_SEARCH_SCOPE_ID]: [
        { noteId: 'top', text: 'Top' },
        { noteId: 'sibling', text: 'Sibling' },
      ],
      top: [
        { noteId: 'child-a', text: 'Child A' },
        { noteId: 'child-b', text: 'Child B' },
      ],
      'child-a': [],
      'child-b': [{ noteId: 'leaf', text: 'Leaf' }],
      leaf: [],
      sibling: [],
    });
  });

  it('reads note-head text only from the real lexical adapter shape', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const result = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return {
        allCandidates: collectSearchCandidatesFromSdk(sdk),
        childCandidateMap: collectChildCandidateMapFromSdk(sdk),
      };
    });

    expect(result.allCandidates).toEqual([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(result.childCandidateMap).toEqual({
      [ROOT_SEARCH_SCOPE_ID]: [
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note3', text: 'note3' },
      ],
      note1: [{ noteId: 'note2', text: 'note2' }],
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

    const allCandidates = collectSearchCandidatesFromSdk(sdk);
    const childCandidateMap = collectChildCandidateMapFromSdk(sdk);

    expect(allCandidates).toHaveLength(depth);
    expect(allCandidates[0]).toEqual({ noteId: 'deep-0', text: 'Deep 0' });
    expect(allCandidates.at(-1)).toEqual({
      noteId: `deep-${depth - 1}`,
      text: `Deep ${depth - 1}`,
    });
    expect(childCandidateMap[ROOT_SEARCH_SCOPE_ID]).toEqual([{ noteId: 'deep-0', text: 'Deep 0' }]);
    expect(childCandidateMap['deep-0']).toEqual([{ noteId: 'deep-1', text: 'Deep 1' }]);
    expect(childCandidateMap[`deep-${depth - 1}`]).toEqual([]);
  });
});
