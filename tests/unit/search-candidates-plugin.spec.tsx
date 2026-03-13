import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('search candidates plugin', () => {
  beforeEach(() => {
    vi.resetModules();
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
    const collectSearchCandidatesFromSdk = vi.fn(() => [{ noteId: 'note1', text: 'note1' }]);
    const collectChildCandidateMapFromSdk = vi.fn(() => ({ note1: [] }));

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      // eslint-disable-next-line react/no-unnecessary-use-prefix -- Mock must match Lexical hook export.
      useLexicalComposerContext: () => [mockEditor],
    }));
    vi.doMock('@/editor/outline/sdk/adapters/lexical', () => ({
      createLexicalNoteSdk: () => ({}),
    }));
    vi.doMock('@/editor/search/sdk-search-candidates', () => ({
      collectSearchCandidatesFromSdk,
      collectChildCandidateMapFromSdk,
    }));

    const { SearchCandidatesPlugin } = await import('@/editor/plugins/SearchCandidatesPlugin');

    render(<SearchCandidatesPlugin docId="main" />);

    await waitFor(() => {
      expect(collectSearchCandidatesFromSdk).toHaveBeenCalledTimes(1);
      expect(collectChildCandidateMapFromSdk).toHaveBeenCalledTimes(1);
    });

    expect(updateListener).not.toBeNull();
    updateListener!({
      dirtyElements: new Map(),
      dirtyLeaves: new Set(),
      editorState: { read },
    });

    expect(collectSearchCandidatesFromSdk).toHaveBeenCalledTimes(1);
    expect(collectChildCandidateMapFromSdk).toHaveBeenCalledTimes(1);
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

    vi.doMock('@lexical/react/LexicalComposerContext', () => ({
      // eslint-disable-next-line react/no-unnecessary-use-prefix -- Mock must match Lexical hook export.
      useLexicalComposerContext: () => [mockEditor],
    }));
    vi.doMock('@/editor/outline/sdk/adapters/lexical', () => ({
      createLexicalNoteSdk: () => ({}),
    }));
    vi.doMock('@/editor/search/sdk-search-candidates', () => ({
      collectSearchCandidatesFromSdk: () => [{ noteId: 'note1', text: 'note1' }],
      collectChildCandidateMapFromSdk: () => ({ note1: [] }),
    }));

    const { SearchCandidatesPlugin } = await import('@/editor/plugins/SearchCandidatesPlugin');

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
      });
    });

    unmount();

    expect(handleCandidatesChange).toHaveBeenLastCalledWith(null);
  });
});
