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
    const collectSearchCandidates = vi.fn(() => [{ noteId: 'note1', text: 'note1' }]);
    const collectChildCandidateMap = vi.fn(() => ({ note1: [] }));
    const collectAncestorPathMap = vi.fn(() => ({ note1: [{ noteId: 'note1', label: 'note1' }] }));
    lexicalComposerContextEditor = mockEditor;

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      useLexicalComposerContext: mockLexicalComposerContext,
    }));
    vi.doMock('#client/editor/note-sdk-adapters', () => ({
      createLexicalEditorNotes: () => ({}),
    }));
    vi.doMock('#client/editor/search/search-candidates', () => ({
      collectSearchCandidates,
      collectChildCandidateMap,
      collectAncestorPathMap,
    }));

    const { SearchCandidatesPlugin } = await import('#client/editor/plugins/SearchCandidatesPlugin');

    render(<SearchCandidatesPlugin docId="main" />);

    await waitFor(() => {
      expect(collectSearchCandidates).toHaveBeenCalledTimes(1);
      expect(collectChildCandidateMap).toHaveBeenCalledTimes(1);
    });

    expect(updateListener).not.toBeNull();
    updateListener!({
      dirtyElements: new Map(),
      dirtyLeaves: new Set(),
      editorState: { read },
    });

    expect(collectSearchCandidates).toHaveBeenCalledTimes(1);
    expect(collectChildCandidateMap).toHaveBeenCalledTimes(1);
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
    vi.doMock('#client/editor/search/search-candidates', () => ({
      collectSearchCandidates: () => [{ noteId: 'note1', text: 'note1' }],
      collectChildCandidateMap: () => ({ note1: [] }),
      collectAncestorPathMap: () => ({ note1: [{ noteId: 'note1', label: 'note1' }] }),
    }));

    const { SearchCandidatesPlugin } = await import('#client/editor/plugins/SearchCandidatesPlugin');

    const { unmount } = render(
      <SearchCandidatesPlugin
        docId="main"
        onCandidatesChange={handleCandidatesChange}
      />
    );

    await waitFor(() => {
      expect(handleCandidatesChange).toHaveBeenCalledWith({
        allCandidates: [{ noteId: 'note1', text: 'note1' }],
        childCandidateMap: { note1: [] },
        ancestorPathMap: { note1: [{ noteId: 'note1', label: 'note1' }] },
      });
    });

    unmount();

    expect(handleCandidatesChange).toHaveBeenLastCalledWith(null);
  });
});
