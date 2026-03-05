import { describe, expect, it } from 'vitest';
import type { EditorNote } from '@/editor/outline/sdk/contracts';
import {
  collectChildCandidateMapFromSdk,
  collectSearchCandidatesFromSdk,
  collectTopLevelSearchCandidatesFromSdk,
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

  it('collects only top-level notes for slash root mode', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
    ]);
    const sibling = createMockEditorNote('sibling', 'Sibling');

    const candidates = collectTopLevelSearchCandidatesFromSdk({
      currentDocument: () => ({
        id: () => 'main',
        kind: () => 'document',
        text: () => 'Main',
        children: () => [top, sibling],
      }),
    });

    expect(candidates).toEqual([
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
});
