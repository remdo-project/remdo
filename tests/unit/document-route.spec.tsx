import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DocumentRoute from '@/routes/DocumentRoute';
import { createDocumentPath } from '@/routing';

interface TestSdkSearchSnapshot {
  allCandidates: Array<{ noteId: string; text: string }>;
  topLevelCandidates: Array<{ noteId: string; text: string }>;
  childCandidateMap: Record<string, Array<{ noteId: string; text: string }>>;
}

vi.mock('@/editor/Editor', async () => {
  const React = await import('react');
  const defaultSnapshot = {
    allCandidates: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note4', text: 'note4' },
      { noteId: 'note5', text: 'note5' },
    ],
    topLevelCandidates: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note5', text: 'note5' },
    ],
    childCandidateMap: {
      note1: [{ noteId: 'note2', text: 'note2' }],
      note2: [],
      note3: [{ noteId: 'note4', text: 'note4' }],
      note4: [],
      note5: [],
    },
  } satisfies TestSdkSearchSnapshot;
  const emptySnapshot = {
    allCandidates: [],
    topLevelCandidates: [],
    childCandidateMap: {},
  } satisfies TestSdkSearchSnapshot;

  interface MockEditorProps {
    docId: string;
    onSearchCandidatesChange?: (snapshot: TestSdkSearchSnapshot) => void;
    searchHighlightedNoteId?: string | null;
    searchModeActive?: boolean;
    zoomNoteId?: string | null;
  }

  function MockEditor({
    docId,
    onSearchCandidatesChange,
    searchHighlightedNoteId,
    searchModeActive,
    zoomNoteId,
  }: MockEditorProps) {
    React.useEffect(() => {
      const candidateMap = (
        globalThis as typeof globalThis & {
          __remdoMockSdkSearchCandidatesByDoc?: Record<string, TestSdkSearchSnapshot | null>;
        }
      ).__remdoMockSdkSearchCandidatesByDoc;
      const candidateSelection = candidateMap?.[docId];

      if (candidateSelection === null) {
        return;
      }

      const sdkSnapshot = candidateSelection ?? defaultSnapshot;
      onSearchCandidatesChange?.(sdkSnapshot);
      return () => {
        onSearchCandidatesChange?.(emptySnapshot);
      };
    }, [docId, onSearchCandidatesChange]);

    const instanceIdRef = React.useRef(`instance-${Math.random().toString(36).slice(2)}`);
    return (
      <>
        <div data-doc-id={docId} data-instance-id={instanceIdRef.current} data-testid="editor-probe" />
        <div
          data-search-highlighted-note-id={searchHighlightedNoteId ?? ''}
          data-search-mode-active={searchModeActive ? 'true' : 'false'}
          data-testid="editor-search-probe"
          data-zoom-note-id={zoomNoteId ?? ''}
        />
        <div className="editor-input" data-testid="editor-input-probe" tabIndex={-1}>
          <ul>
            <li className="list-item" data-note-id="note1">note1</li>
            <li className="list-item zoom-hidden" data-note-id="note2">note2</li>
            <li className="list-item" data-note-id="note3">note3</li>
            <li className="list-item" data-note-id="note4" style={{ display: 'none' }}>note4</li>
            <li className="list-item" data-note-id="note5">note5</li>
          </ul>
        </div>
      </>
    );
  }

  return { default: MockEditor };
});

vi.mock('@/editor/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: () => null,
}));

describe('document route', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSdkSearchCandidatesByDoc?: Record<string, TestSdkSearchSnapshot | null>;
      }
    ).__remdoMockSdkSearchCandidatesByDoc = undefined;
  });

  const renderDocumentRoute = (initialEntry: string = createDocumentPath('main')) => {
    const router = createMemoryRouter(
      [{ path: '/n/:docRef', element: <DocumentRoute /> }],
      { initialEntries: [initialEntry] },
    );

    render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    );

    return router;
  };

  const getActiveSearchResult = () =>
    document.querySelector<HTMLElement>('[data-search-result-item][data-search-result-active="true"]');

  it('remounts editor when document id changes via route params', async () => {
    const router = renderDocumentRoute();

    const first = await screen.findByTestId('editor-probe');
    const firstInstanceId = first.dataset.instanceId;
    expect(first.dataset.docId).toBe('main');

    await router.navigate(createDocumentPath('other'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe').dataset.docId).toBe('other');
    });

    const second = screen.getByTestId('editor-probe');
    expect(second.dataset.instanceId).not.toBe(firstInstanceId);
  });

  it('focuses search on find shortcut and allows browser find on second press', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });

    const firstShortcut = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'f',
      metaKey: true,
    });
    document.dispatchEvent(firstShortcut);
    expect(firstShortcut.defaultPrevented).toBe(true);
    expect(searchInput).toHaveFocus();

    const secondShortcut = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'f',
      metaKey: true,
    });
    document.dispatchEvent(secondShortcut);
    expect(secondShortcut.defaultPrevented).toBe(false);
    expect(searchInput).toHaveFocus();
  });

  it('focuses search on find shortcut for localized key values using KeyF code', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });

    const localizedShortcut = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'а',
      code: 'KeyF',
      metaKey: true,
    });

    document.dispatchEvent(localizedShortcut);
    expect(localizedShortcut.defaultPrevented).toBe(true);
    expect(searchInput).toHaveFocus();
  });

  it('moves focus to editor when Escape is pressed in search', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });

    searchInput.focus();
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).not.toHaveFocus();
    expect(document.activeElement).toHaveClass('editor-input');
  });

  it('moves focus to editor on Escape in flat results when editor pane is hidden', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    await screen.findByTestId('document-search-results');

    expect(document.querySelector('.document-editor-pane--hidden')).not.toBeNull();

    fireEvent.keyDown(searchInput, { key: 'Escape' });

    await waitFor(() => {
      expect(searchInput).not.toHaveFocus();
      expect(document.activeElement).toHaveClass('editor-input');
    });
  });

  it('shows all notes in flat results and highlights the first item on empty query', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
  });

  it('switches to slash mode and shows top-level candidates for "/"', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    const results = await screen.findByTestId('document-search-results');
    expect(results.dataset.searchMode).toBe('slash');

    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1', 'note3', 'note5']);
    expect(getActiveSearchResult()?.textContent).toBe('note1');
  });

  it('moves slash-mode highlight over top-level candidates without wraparound', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/note3');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note5');
    expect(searchInput).toHaveValue('/note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note5');
    expect(searchInput).toHaveValue('/note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/note3');
  });

  it('descends slash scope to highlighted note children after appending "/"', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/note3');

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note4']);
      expect(getActiveSearchResult()?.textContent).toBe('note4');
      expect(searchInput).toHaveValue('/note3/');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(searchInput).toHaveValue('/note3/note4');
    });
  });

  it('keeps cycling scope after slash input is auto-written', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/note3');

    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1', 'note3', 'note5']);
  });

  it('auto-writes a deeper slash path after descending twice', async () => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSdkSearchCandidatesByDoc?: Record<string, TestSdkSearchSnapshot | null>;
      }
    ).__remdoMockSdkSearchCandidatesByDoc = {
      main: {
        allCandidates: [
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note3', text: 'note3' },
          { noteId: 'note4', text: 'note4' },
          { noteId: 'note5', text: 'note5' },
          { noteId: 'note6', text: 'note6' },
        ],
        topLevelCandidates: [
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note3', text: 'note3' },
          { noteId: 'note5', text: 'note5' },
        ],
        childCandidateMap: {
          note1: [{ noteId: 'note2', text: 'note2' }],
          note2: [],
          note3: [{ noteId: 'note4', text: 'note4' }],
          note4: [{ noteId: 'note6', text: 'note6' }],
          note5: [],
          note6: [],
        },
      },
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('/note3');

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });
    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note4');
    });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(searchInput).toHaveValue('/note3/note4');
    });

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });
    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note6');
    });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(searchInput).toHaveValue('/note3/note4/note6');
    });
  });

  it('moves highlight with arrows over flat results without wraparound', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note2');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveSearchResult()?.textContent).toBe('note4');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveSearchResult()?.textContent).toBe('note1');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveSearchResult()?.textContent).toBe('note1');
  });

  it('shows flat results across the whole document while query is non-empty', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await screen.findByTestId('document-search-results');
    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
    expect(document.querySelector('.document-editor-pane--hidden')).not.toBeNull();
  });

  it('uses sdk-provided candidates for flat results', async () => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSdkSearchCandidatesByDoc?: Record<string, TestSdkSearchSnapshot | null>;
      }
    ).__remdoMockSdkSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'sdk1', text: 'sdk result' }],
        topLevelCandidates: [{ noteId: 'sdk1', text: 'sdk result' }],
        childCandidateMap: {
          sdk1: [],
        },
      },
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'sdk' } });

    await screen.findByTestId('document-search-results');
    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);

    expect(resultItems).toEqual(['sdk result']);
  });

  it('keeps no highlight for no-match query and Enter is a no-op', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    await screen.findByText('No matches');
    expect(getActiveSearchResult()).toBeNull();

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('main'));
    expect(searchInput).toHaveFocus();
  });

  it('clears stale sdk candidates when switching documents', async () => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSdkSearchCandidatesByDoc?: Record<string, TestSdkSearchSnapshot | null>;
      }
    ).__remdoMockSdkSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'mainonly', text: 'main only' }],
        topLevelCandidates: [{ noteId: 'mainonly', text: 'main only' }],
        childCandidateMap: {
          mainonly: [],
        },
      },
      other: null,
    };

    const router = renderDocumentRoute();
    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'main' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('main only');
    });

    await router.navigate(createDocumentPath('other'));

    const otherSearchInput = await screen.findByRole('textbox', { name: 'Search document' });
    otherSearchInput.focus();
    fireEvent.change(otherSearchInput, { target: { value: 'main' } });

    await screen.findByText('No matches');
    expect(document.querySelectorAll('[data-search-result-item]')).toHaveLength(0);

    fireEvent.keyDown(otherSearchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('other'));
  });

  it('zooms to document root on Enter when query is exactly "/"', async () => {
    const router = renderDocumentRoute(createDocumentPath('main', 'note3'));

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });
    await screen.findByTestId('document-search-results');

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('main'));
    });
    expect(document.activeElement).toHaveClass('editor-input');
  });

  it('zooms to highlighted flat result on Enter and moves focus to editor', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note3' } });

    await waitFor(() => {
      const active = document.querySelector<HTMLElement>('[data-search-result-item][data-search-result-active=\"true\"]');
      expect(active?.textContent).toBe('note3');
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('main', 'note3'));
    });
    expect(document.activeElement).toHaveClass('editor-input');
  });

  it('zooms to highlighted slash descendant on Enter', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });
    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note4');
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('main', 'note4'));
    });
    expect(document.activeElement).toHaveClass('editor-input');
  });

  it('ends search mode on blur and hides flat results', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    await screen.findByTestId('document-search-results');

    fireEvent.blur(searchInput);

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
    });
  });

  it('blurs search on Escape when editor input is unavailable', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    screen.getByTestId('editor-input-probe').remove();

    searchInput.focus();
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).not.toHaveFocus();
  });
});
