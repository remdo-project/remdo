import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { createLexicalNoteSdk } from '@/notes/adapters/lexical';
import type { EditorNote } from '@/notes/contracts';
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

  it('collects deep single-child chains without stack overflow', () => {
    const depth = 12_000;
    const root = createDeepChain(depth);
    const sdk = {
      currentDocument: () => ({
        id: () => 'main',
        kind: () => 'document' as const,
        text: () => 'Main',
        children: () => [root],
      }),
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
