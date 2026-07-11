import { describe, expect, it, vi } from 'vitest';
import { meta } from '#tests';
import { createLexicalEditorNotes } from '#client/editor/note-sdk-adapters';
import type { NoteListType } from '#note-sdk';
import { collectDocumentSearchResults } from '#client/editor/search/search-candidates';
import type { SearchCandidate } from '#client/editor/search/search-candidates';

const ALL = { query: '', limit: Number.MAX_SAFE_INTEGER, childPreviewLimit: 2 };

const withoutChildPreviews = (results: SearchCandidate[]) =>
  results.map(({ childPreview: _childPreview, ...result }) => result);

interface MockEditorNote {
  id: () => string;
  text: () => string;
  listType: () => NoteListType;
  checked: () => boolean;
  children: () => MockEditorNote[];
}

function createMockEditorNote(
  id: string,
  text: string,
  children: MockEditorNote[] = [],
  options: { listType?: NoteListType; checked?: boolean } = {}
): MockEditorNote {
  return {
    id: () => id,
    text: () => text,
    listType: () => options.listType ?? 'bullet',
    checked: () => options.checked ?? false,
    children: () => children,
  };
}

function createMockDocumentNote(children: MockEditorNote[]) {
  return { children: () => children };
}

function createDeepChain(depth: number): MockEditorNote {
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
    expect(withoutChildPreviews(flatResults)).toEqual([
      { noteId: 'top', text: 'Top', listType: 'bullet', checked: false, path: [{ noteId: 'top', label: 'Top' }] },
      {
        noteId: 'child-a', text: 'Child A', listType: 'bullet', checked: false,
        path: [{ noteId: 'top', label: 'Top' }, { noteId: 'child-a', label: 'Child A' }],
      },
      {
        noteId: 'child-b', text: 'Child B', listType: 'bullet', checked: false,
        path: [{ noteId: 'top', label: 'Top' }, { noteId: 'child-b', label: 'Child B' }],
      },
      {
        noteId: 'leaf', text: 'Leaf', listType: 'bullet', checked: false,
        path: [
          { noteId: 'top', label: 'Top' },
          { noteId: 'child-b', label: 'Child B' },
          { noteId: 'leaf', label: 'Leaf' },
        ],
      },
      { noteId: 'sibling', text: 'Sibling', listType: 'bullet', checked: false, path: [{ noteId: 'sibling', label: 'Sibling' }] },
    ]);
  });

  it('returns empty results when there are no root notes', () => {
    const { flatResults, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([]),
    }, ALL);

    expect(flatResults).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it('builds a child preview with the first N children and the exact total count', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('child-a', 'Child A'),
      createMockEditorNote('child-b', 'Child B', [createMockEditorNote('leaf', 'Leaf')]),
      createMockEditorNote('child-c', 'Child C'),
    ]);

    const { flatResults } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([top]),
    }, ALL);

    // childPreviewLimit is 2, but totalCount reflects all three children so the
    // row can show "+1 more".
    expect(flatResults.find((result) => result.noteId === 'top')!.childPreview).toEqual({
      items: [
        { noteId: 'child-a', text: 'Child A', listType: 'bullet', checked: false },
        { noteId: 'child-b', text: 'Child B', listType: 'bullet', checked: false },
      ],
      totalCount: 3,
    });
    expect(flatResults.find((result) => result.noteId === 'child-b')!.childPreview).toEqual({
      items: [{ noteId: 'leaf', text: 'Leaf', listType: 'bullet', checked: false }],
      totalCount: 1,
    });
    expect(flatResults.find((result) => result.noteId === 'child-a')!.childPreview)
      .toEqual({ items: [], totalCount: 0 });
  });

  it('captures list type and checked state per child-preview item', () => {
    const top = createMockEditorNote('top', 'Top', [
      createMockEditorNote('step-1', 'Step one', [], { listType: 'number' }),
      createMockEditorNote('done', 'Done item', [], { listType: 'check', checked: true }),
    ]);

    const { flatResults } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote([top]),
    }, ALL);

    expect(flatResults.find((result) => result.noteId === 'top')!.childPreview.items).toEqual([
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

    const { flatResults, hasMore } = collectDocumentSearchResults({
      currentDocument: () => createMockDocumentNote(notes),
    }, { ...ALL, limit: 3 });

    expect(hasMore).toBe(true);
    expect(flatResults.map((result) => result.noteId)).toEqual(['n0', 'n1', 'n2']);
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

    expect(withoutChildPreviews(result.flatResults)).toEqual([
      { noteId: 'note1', text: 'note1', listType: 'bullet', checked: false, path: [{ noteId: 'note1', label: 'note1' }] },
      {
        noteId: 'note2', text: 'note2', listType: 'bullet', checked: false,
        path: [{ noteId: 'note1', label: 'note1' }, { noteId: 'note2', label: 'note2' }],
      },
      { noteId: 'note3', text: 'note3', listType: 'bullet', checked: false, path: [{ noteId: 'note3', label: 'note3' }] },
    ]);
    expect(result.flatResults.map(({ noteId, childPreview }) => ({ noteId, childPreview }))).toEqual([
      {
        noteId: 'note1',
        childPreview: {
          items: [{ noteId: 'note2', text: 'note2', listType: 'bullet', checked: false }],
          totalCount: 1,
        },
      },
      { noteId: 'note2', childPreview: { items: [], totalCount: 0 } },
      { noteId: 'note3', childPreview: { items: [], totalCount: 0 } },
    ]);
  });

  it('collects deep single-child chains without stack overflow', () => {
    const depth = 12_000;
    const root = createDeepChain(depth);
    const sdk = {
      currentDocument: () => createMockDocumentNote([root]),
    };

    const { flatResults } = collectDocumentSearchResults(sdk, ALL);

    expect(flatResults).toHaveLength(depth);
    expect(flatResults[0]).toMatchObject({
      noteId: 'deep-0', text: 'Deep 0', listType: 'bullet', checked: false,
      path: [{ noteId: 'deep-0', label: 'Deep 0' }],
    });
    expect(flatResults.at(-1)).toMatchObject({
      noteId: `deep-${depth - 1}`,
      text: `Deep ${depth - 1}`,
      listType: 'bullet',
      checked: false,
      path: Array.from({ length: depth }, (_unused, index) => ({
        noteId: `deep-${index}`,
        label: `Deep ${index}`,
      })),
    });
    expect(flatResults[0]!.childPreview).toEqual({
      items: [{ noteId: 'deep-1', text: 'Deep 1', listType: 'bullet', checked: false }],
      totalCount: 1,
    });
    expect(flatResults.at(-1)!.childPreview).toEqual({ items: [], totalCount: 0 });
  });
});
