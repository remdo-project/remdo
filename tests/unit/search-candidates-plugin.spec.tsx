import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockEditor {
  getEditorState: () => { read: (callback: () => unknown) => unknown };
  registerUpdateListener: (listener: ((payload: { dirtyElements: Map<string, boolean>; dirtyLeaves: Set<string>; editorState: { read: (callback: () => unknown) => unknown } }) => void) | null) => () => void;
  registerRootListener: () => () => void;
}

let lexicalComposerContextEditor: MockEditor | null = null;

function mockLexicalComposerContext() {
  return [lexicalComposerContextEditor] as const;
}

describe('search candidates plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    lexicalComposerContextEditor = null;
  });

  it('skips rebuilding candidates on selection-only updates', async () => {
    const read = vi.fn((callback: () => unknown) => callback());
    let updateListener: ((payload: { dirtyElements: Map<string, boolean>; dirtyLeaves: Set<string>; editorState: { read: typeof read } }) => void) | null = null;

    const mockEditor = {
      getEditorState: () => ({ read }),
      registerUpdateListener: (listener: typeof updateListener) => {
        updateListener = listener;
        return () => {};
      },
      registerRootListener: () => () => {},
    };
    const collectSearchCandidateSnapshot = vi.fn(() => ({
      allCandidates: [{ noteId: 'note1', text: 'note1', listType: 'bullet', checked: false }],
      childCandidateMap: { note1: [] },
      ancestorPathMap: { note1: [{ noteId: 'note1', label: 'note1' }] },
    }));
    lexicalComposerContextEditor = mockEditor;

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      useLexicalComposerContext: mockLexicalComposerContext,
    }));
    vi.doMock('#client/editor/note-sdk-adapters', () => ({
      createLexicalEditorNotes: () => ({}),
    }));
    vi.doMock('#client/editor/search/search-candidates', () => ({
      collectSearchCandidateSnapshot,
    }));

    const { SearchCandidatesPlugin } = await import('#client/editor/plugins/SearchCandidatesPlugin');

    render(<SearchCandidatesPlugin docId="main" />);

    await waitFor(() => {
      expect(collectSearchCandidateSnapshot).toHaveBeenCalledTimes(1);
    });

    expect(updateListener).not.toBeNull();
    updateListener!({
      dirtyElements: new Map(),
      dirtyLeaves: new Set(),
      editorState: { read },
    });

    // Selection-only update (no dirty nodes) must not rebuild.
    expect(collectSearchCandidateSnapshot).toHaveBeenCalledTimes(1);
  });

  it('re-emits candidates when only checked/list-type changes (same text)', async () => {
    const read = vi.fn((callback: () => unknown) => callback());
    let updateListener: ((payload: { dirtyElements: Map<string, boolean>; dirtyLeaves: Set<string>; editorState: { read: typeof read } }) => void) | null = null;
    const handleCandidatesChange = vi.fn();

    const mockEditor = {
      getEditorState: () => ({ read }),
      registerUpdateListener: (listener: typeof updateListener) => {
        updateListener = listener;
        return () => {};
      },
      registerRootListener: () => () => {},
    };
    // First read unchecked, then checked — same noteId/text, only `checked` flips.
    let checked = false;
    lexicalComposerContextEditor = mockEditor;

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      useLexicalComposerContext: mockLexicalComposerContext,
    }));
    vi.doMock('#client/editor/note-sdk-adapters', () => ({
      createLexicalEditorNotes: () => ({}),
    }));
    vi.doMock('#client/editor/search/search-candidates', () => ({
      collectSearchCandidateSnapshot: () => ({
        allCandidates: [{ noteId: 'note1', text: 'note1', listType: 'bullet', checked: false }],
        childCandidateMap: { note1: [{ noteId: 'c1', text: 'child', listType: 'check', checked }] },
        ancestorPathMap: { note1: [{ noteId: 'note1', label: 'note1' }] },
      }),
    }));

    const { SearchCandidatesPlugin } = await import('#client/editor/plugins/SearchCandidatesPlugin');

    render(<SearchCandidatesPlugin docId="main" onCandidatesChange={handleCandidatesChange} />);

    await waitFor(() => {
      expect(handleCandidatesChange).toHaveBeenCalledTimes(1);
    });

    checked = true;
    updateListener!({
      dirtyElements: new Map([['k', true]]),
      dirtyLeaves: new Set(),
      editorState: { read },
    });

    // The change is checked-only (text unchanged) — it must still re-emit.
    expect(handleCandidatesChange).toHaveBeenCalledTimes(2);
    expect(handleCandidatesChange.mock.calls[1]![0].childCandidateMap.note1[0].checked).toBe(true);
  });

  it('invalidates candidates on unmount instead of publishing an empty snapshot', async () => {
    const handleCandidatesChange = vi.fn();
    const mockEditor = {
      getEditorState: () => ({
        read: (callback: () => unknown) => callback(),
      }),
      registerUpdateListener: () => () => {},
      registerRootListener: () => () => {},
    };
    lexicalComposerContextEditor = mockEditor;

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      useLexicalComposerContext: mockLexicalComposerContext,
    }));
    vi.doMock('#client/editor/note-sdk-adapters', () => ({
      createLexicalEditorNotes: () => ({}),
    }));
    const snapshot = {
      allCandidates: [{ noteId: 'note1', text: 'note1', listType: 'bullet', checked: false }],
      childCandidateMap: { note1: [] },
      ancestorPathMap: { note1: [{ noteId: 'note1', label: 'note1' }] },
    };
    vi.doMock('#client/editor/search/search-candidates', () => ({
      collectSearchCandidateSnapshot: () => snapshot,
    }));

    const { SearchCandidatesPlugin } = await import('#client/editor/plugins/SearchCandidatesPlugin');

    const { unmount } = render(
      <SearchCandidatesPlugin
        docId="main"
        onCandidatesChange={handleCandidatesChange}
      />
    );

    await waitFor(() => {
      expect(handleCandidatesChange).toHaveBeenCalledWith(snapshot);
    });

    unmount();

    expect(handleCandidatesChange).toHaveBeenLastCalledWith(null);
  });
});
