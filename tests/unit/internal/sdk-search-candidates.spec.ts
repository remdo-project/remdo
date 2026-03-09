import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import type { EditorNote } from '@/editor/outline/sdk/contracts';
import {
  collectChildCandidateMapFromSdk,
  collectSearchCandidatesFromSdk,
  ROOT_SEARCH_SCOPE_ID,
} from '@/editor/search/sdk-search-candidates';

function createMockEditorNote(
  id: string,
  text: string,
  children: EditorNote[] = []
): EditorNote {
  return {
    id: () => id,
    kind: () => 'editor-note',
    attached: () => true,
    text: () => text,
    children: () => children,
  };
}

describe('sdk search candidates', () => {
  it('flattens root notes and descendants in pre-order', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const candidates = collectSearchCandidatesFromSdk({
      currentDocument: () => ({
        id: () => 'main',
        kind: () => 'document',
        text: () => 'Main',
        children: () => [top, sibling],
      }),
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
      currentDocument: () => ({
        id: () => 'main',
        kind: () => 'document',
        text: () => 'Main',
        children: () => [],
      }),
    });

    expect(candidates).toEqual([]);
  });

  it('stores slash-root candidates under the synthetic root scope key', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const childCandidateMap = collectChildCandidateMapFromSdk({
      currentDocument: () => ({
        id: () => 'main',
        kind: () => 'document',
        text: () => 'Main',
        children: () => [top, sibling],
      }),
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
      currentDocument: () => ({
        id: () => 'main',
        kind: () => 'document',
        text: () => 'Main',
        children: () => [top, sibling],
      }),
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
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
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
});
