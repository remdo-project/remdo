import { describe, expect, it } from 'vitest';
import type { DocumentSnapshot, EditorNoteSnapshot, NoteId } from '#note-sdk';
import { collectDocumentSearchResults } from './document-search';

const ALL = { query: '', limit: Number.MAX_SAFE_INTEGER, childPreviewLimit: 2 };

function note(
  id: NoteId,
  text: string,
  fields: Partial<Pick<EditorNoteSnapshot, 'children' | 'checked'>> = {},
): EditorNoteSnapshot {
  return {
    id,
    text,
    checked: false,
    folded: false,
    children: null,
    ...fields,
  };
}

function documentSnapshot(
  rootIds: NoteId[],
  notes: EditorNoteSnapshot[] = [],
): DocumentSnapshot {
  return {
    documentId: 'main',
    root: { listType: 'bullet', noteIds: rootIds },
    notes: new Map(notes.map((note) => [note.id, note])),
  };
}

describe('document search', () => {
  it('flattens root notes and descendants in pre-order', () => {
    const snapshot = documentSnapshot(['top', 'sibling'], [
      note('top', 'Top', { children: { listType: 'bullet', noteIds: ['child-a', 'child-b'] } }),
      note('child-a', 'Child A'),
      note('child-b', 'Child B', { children: { listType: 'bullet', noteIds: ['leaf'] } }),
      note('leaf', 'Leaf'),
      note('sibling', 'Sibling'),
    ]);

    const { flatResults, hasMore } = collectDocumentSearchResults(
      snapshot,
      ALL,
    );

    expect(hasMore).toBe(false);
    expect(flatResults.map((result) => result.note.id)).toEqual([
      'top', 'child-a', 'child-b', 'leaf', 'sibling',
    ]);
    expect(flatResults.map((result) => result.path.map((note) => note.id))).toEqual([
      ['top'],
      ['top', 'child-a'],
      ['top', 'child-b'],
      ['top', 'child-b', 'leaf'],
      ['sibling'],
    ]);
    // Results and paths retain the SDK's records rather than copying note data.
    expect(flatResults[0]!.note).toBe(snapshot.notes.get('top'));
    expect(flatResults[3]!.path[0]).toBe(snapshot.notes.get('top'));
  });

  it('returns empty results when the snapshot has no root notes', () => {
    const { flatResults, hasMore } = collectDocumentSearchResults(documentSnapshot([]), ALL);
    expect(flatResults).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it('builds a bounded child preview with the exact child count', () => {
    const snapshot = documentSnapshot(['top'], [
      note('top', 'Top', { children: { listType: 'bullet', noteIds: ['child-a', 'child-b', 'child-c'] } }),
      note('child-a', 'Child A'),
      note('child-b', 'Child B', { children: { listType: 'bullet', noteIds: ['leaf'] } }),
      note('leaf', 'Leaf'),
      note('child-c', 'Child C'),
    ]);

    const { flatResults } = collectDocumentSearchResults(snapshot, ALL);

    expect(flatResults.find((result) => result.note.id === 'top')!.childPreview).toMatchObject({
      notes: [
        { id: 'child-a', text: 'Child A', checked: false },
        { id: 'child-b', text: 'Child B', checked: false },
      ],
      listType: 'bullet',
      totalCount: 3,
    });
    expect(flatResults.find((result) => result.note.id === 'child-b')!.childPreview).toMatchObject({
      notes: [{ id: 'leaf', text: 'Leaf', checked: false }],
      listType: 'bullet',
      totalCount: 1,
    });
    expect(flatResults.find((result) => result.note.id === 'child-a')!.childPreview)
      .toMatchObject({ notes: [], totalCount: 0 });
  });

  it('uses parent-owned list type and each child checked state', () => {
    const snapshot = documentSnapshot(['top'], [
      note('top', 'Top', { children: { listType: 'check', noteIds: ['pending', 'done'] } }),
      note('pending', 'Pending'),
      note('done', 'Done item', { checked: true }),
    ]);

    const { flatResults } = collectDocumentSearchResults(snapshot, ALL);

    expect(flatResults[0]!.childPreview).toMatchObject({
      listType: 'check',
      notes: [
        { id: 'pending', text: 'Pending', checked: false },
        { id: 'done', text: 'Done item', checked: true },
      ],
      totalCount: 2,
    });
  });

  it('filters matches in document order', () => {
    const snapshot = documentSnapshot(['work'], [
      note('work', 'Work', { children: { listType: 'bullet', noteIds: ['roadmap', 'groceries', 'roadworks'] } }),
      note('roadmap', 'Roadmap'),
      note('groceries', 'Groceries'),
      note('roadworks', 'Roadworks'),
    ]);

    const { flatResults, hasMore } = collectDocumentSearchResults(
      snapshot,
      { ...ALL, query: 'road' },
    );

    expect(hasMore).toBe(false);
    expect(flatResults.map((result) => result.note.id)).toEqual(['roadmap', 'roadworks']);
  });

  it('caps results and detects one additional match without traversing its subtree', () => {
    const snapshot = documentSnapshot(['n0', 'n1', 'n2', 'n3'], [
      note('n0', 'Note 0'),
      note('n1', 'Note 1'),
      note('n2', 'Note 2'),
      note('n3', 'Note 3', { children: { listType: 'bullet', noteIds: ['missing-descendant'] } }),
    ]);

    const { flatResults, hasMore } = collectDocumentSearchResults(snapshot, { ...ALL, limit: 3 });

    expect(hasMore).toBe(true);
    expect(flatResults.map((result) => result.note.id)).toEqual(['n0', 'n1', 'n2']);
  });

  it('does not flag more results when matches exactly fill the limit', () => {
    const snapshot = documentSnapshot(['n0', 'n1', 'n2'], [
      note('n0', 'Note 0'),
      note('n1', 'Note 1'),
      note('n2', 'Note 2'),
    ]);
    const { flatResults, hasMore } = collectDocumentSearchResults(
      snapshot,
      { ...ALL, limit: 3 },
    );

    expect(hasMore).toBe(false);
    expect(flatResults).toHaveLength(3);
  });

  it('collects deep single-child chains without stack overflow', () => {
    const depth = 12_000;
    const notes = Array.from({ length: depth }, (_unused, index) =>
      note(`deep-${index}`, `Deep ${index}`, {
        children: index + 1 < depth
          ? { listType: 'bullet', noteIds: [`deep-${index + 1}`] }
          : null,
      }));
    const { flatResults } = collectDocumentSearchResults(
      documentSnapshot(['deep-0'], notes),
      ALL,
    );

    expect(flatResults).toHaveLength(depth);
    expect(flatResults[0]).toMatchObject({
      note: { id: 'deep-0', text: 'Deep 0', checked: false },
      path: [{ id: 'deep-0', text: 'Deep 0' }],
    });
    expect(flatResults.at(-1)).toMatchObject({
      note: { id: `deep-${depth - 1}`, text: `Deep ${depth - 1}`, checked: false },
      path: Array.from({ length: depth }, (_unused, index) => ({
        id: `deep-${index}`,
        text: `Deep ${index}`,
      })),
    });
    expect(flatResults[0]!.childPreview).toMatchObject({
      notes: [{ id: 'deep-1', text: 'Deep 1', checked: false }],
      listType: 'bullet',
      totalCount: 1,
    });
    expect(flatResults.at(-1)!.childPreview).toMatchObject({ notes: [], totalCount: 0 });
  });
});
