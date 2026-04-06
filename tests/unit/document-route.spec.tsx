import * as React from 'react';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestUserConfig } from '#tests';

import { ROOT_SEARCH_SCOPE_ID } from '@/editor/search/search-candidates';
import DocumentRoute from '@/routes/DocumentRoute';
import { createDocumentPath } from '@/routing';

vi.mock('@/documents/user-config', async () => {
  const { mockUserConfigModule } = await import('#tests');
  return mockUserConfigModule();
});

interface TestSearchSnapshot {
  allCandidates: Array<{ noteId: string; text: string }>;
  childCandidateMap: Record<string, Array<{ noteId: string; text: string }>>;
}

interface MockSearchGlobals {
  __remdoMockSearchCandidateEmitters?: Record<string, () => void>;
  __remdoMockSearchCandidateResetters?: Record<string, () => void>;
  __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
}

const defaultSnapshot = {
  allCandidates: [
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note2', text: 'note2' },
    { noteId: 'note3', text: 'note3' },
    { noteId: 'note4', text: 'note4' },
    { noteId: 'note5', text: 'note5' },
  ],
  childCandidateMap: {
    [ROOT_SEARCH_SCOPE_ID]: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note5', text: 'note5' },
    ],
    note1: [{ noteId: 'note2', text: 'note2' }],
    note2: [],
    note3: [{ noteId: 'note4', text: 'note4' }],
    note4: [],
    note5: [],
  },
} satisfies TestSearchSnapshot;

let mockEditorInstanceCounter = 0;

interface MockEditorProps {
  docId: string;
  onSearchCandidatesChange?: (snapshot: TestSearchSnapshot | null) => void;
  searchModeRequested?: boolean;
  zoomNoteId?: string | null;
}

function MockEditor({
  docId,
  onSearchCandidatesChange,
  searchModeRequested,
  zoomNoteId,
}: MockEditorProps) {
  React.useEffect(() => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    const emitCurrentSnapshot = () => {
      const candidateSelection = globals.__remdoMockSearchCandidatesByDoc?.[docId];
      if (candidateSelection === null) {
        return;
      }

      const sdkSnapshot = candidateSelection ?? defaultSnapshot;
      onSearchCandidatesChange?.(sdkSnapshot);
    };

    emitCurrentSnapshot();
    (globals.__remdoMockSearchCandidateEmitters ??= {})[docId] = emitCurrentSnapshot;
    (globals.__remdoMockSearchCandidateResetters ??= {})[docId] = () => {
      onSearchCandidatesChange?.(null);
    };
    return () => {
      if (globals.__remdoMockSearchCandidateEmitters?.[docId] === emitCurrentSnapshot) {
        delete globals.__remdoMockSearchCandidateEmitters[docId];
      }
      if (globals.__remdoMockSearchCandidateResetters?.[docId]) {
        delete globals.__remdoMockSearchCandidateResetters[docId];
      }
      onSearchCandidatesChange?.(null);
    };
  }, [docId, onSearchCandidatesChange]);

  const instanceId = React.useRef(`instance-${++mockEditorInstanceCounter}`).current;
  return (
    <>
      <div
        data-doc-id={docId}
        data-instance-id={instanceId}
        data-search-mode-requested={searchModeRequested ? 'true' : 'false'}
        data-testid="editor-probe"
      />
      <div data-testid="editor-search-probe" data-zoom-note-id={zoomNoteId ?? ''} />
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

vi.mock('@/editor/Editor', async () => {
  return { default: MockEditor };
});

vi.mock('@/editor/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: () => null,
}));

describe('document route', () => {
  beforeEach(() => {
    resetTestUserConfig();
    mockEditorInstanceCounter = 0;
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = undefined;
    globals.__remdoMockSearchCandidateEmitters = undefined;
    globals.__remdoMockSearchCandidateResetters = undefined;
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
  const getInlineCompletion = () =>
    document.querySelector<HTMLElement>('[data-testid="document-search-inline-completion"]');

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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });

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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });

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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });

    searchInput.focus();
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).not.toHaveFocus();
    expect(document.activeElement).toHaveClass('editor-input');
  });

  it('moves focus to editor on Escape in flat results when editor pane is hidden', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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

  it('hides placeholder while search mode is active and restores it on blur', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    expect(searchInput).toHaveAttribute('placeholder', 'Search');

    searchInput.focus();
    await waitFor(() => {
      expect(searchInput).toHaveAttribute('placeholder', '');
    });

    fireEvent.blur(searchInput);
    await waitFor(() => {
      expect(searchInput).toHaveAttribute('placeholder', 'Search');
    });
  });

  it('requests search candidates from the editor only while search is focused', async () => {
    renderDocumentRoute();

    const editorProbe = await screen.findByTestId('editor-probe');
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });

    expect(editorProbe.dataset.searchModeRequested).toBe('false');

    searchInput.focus();
    await waitFor(() => {
      expect(editorProbe.dataset.searchModeRequested).toBe('true');
    });

    fireEvent.blur(searchInput);
    await waitFor(() => {
      expect(editorProbe.dataset.searchModeRequested).toBe('false');
    });
  });

  it('shows all notes in flat results and highlights the first item on empty query', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
  });

  it('marks non-leaf flat results with a children hint flag', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
    });

    const results = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'));
    const note1 = results.find((item) => item.textContent === 'note1');
    const note2 = results.find((item) => item.textContent === 'note2');
    const note3 = results.find((item) => item.textContent === 'note3');
    expect(note1).toHaveAttribute('data-search-result-has-children', 'true');
    expect(note3).toHaveAttribute('data-search-result-has-children', 'true');
    expect(note2).not.toHaveAttribute('data-search-result-has-children');
  });

  it('exposes combobox/listbox semantics with active-descendant tracking', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    const resultsListbox = await screen.findByRole('listbox', { name: 'Search results' });
    expect(searchInput).toHaveAttribute('aria-haspopup', 'listbox');
    expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    expect(searchInput).toHaveAttribute('aria-controls', resultsListbox.id);

    const firstOption = screen.getByRole('option', { name: 'note1' });
    expect(firstOption).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', firstOption.id);

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    const secondOption = screen.getByRole('option', { name: 'note2' });
    expect(firstOption).toHaveAttribute('aria-selected', 'false');
    expect(secondOption).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', secondOption.id);
  });

  it('keeps the first matching result highlighted when recovering from no matches', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'zzzz' } });
    await screen.findByText('No matches');

    fireEvent.change(searchInput, { target: { value: 'note' } });

    const firstOption = screen.getByRole('option', { name: 'note1' });
    expect(firstOption).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', firstOption.id);

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('main', 'note1'));
    });
  });

  it('keeps the search popup exposed as a listbox when there are no matches', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'zzzz' } });

    const resultsListbox = await screen.findByRole('listbox', { name: 'Search results' });
    const emptyOption = screen.getByRole('option', { name: 'No matches' });

    expect(searchInput).toHaveAttribute('aria-controls', resultsListbox.id);
    expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    expect(emptyOption).toHaveAttribute('aria-disabled', 'true');
  });

  it('zooms to a clicked search result and closes search', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note3' } });

    const result = await screen.findByRole('option', { name: 'note3' });
    fireEvent.pointerDown(result);
    expect(router.state.location.pathname).toBe(createDocumentPath('main'));
    expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
    fireEvent.click(result);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('main', 'note3'));
      expect(screen.queryByTestId('document-search-results')).toBeNull();
    });
  });

  it('dismisses search on outside primary click without changing the route', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await screen.findByTestId('document-search-results');

    fireEvent.pointerDown(screen.getByTestId('editor-probe'), {
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('main'));
      expect(screen.queryByTestId('document-search-results')).toBeNull();
    });
  });

  it('shows slash inline completion on empty query and accepts it on ArrowRight', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('/');
      expect(getInlineCompletion()?.dataset.inlineCompletionHint).toBe('→');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowRight' });
    expect(searchInput).toHaveValue('/');
  });

  it('does not show inline completion for non-empty text mode queries', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await waitFor(() => {
      expect(getInlineCompletion()).toBeNull();
    });
  });

  it('switches to slash mode and shows top-level candidates for "/"', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    const results = await screen.findByTestId('document-search-results');
    expect(results.dataset.searchMode).toBe('slash');

    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1', 'note3', 'note5']);
    expect(getActiveSearchResult()?.textContent).toBe('note1');
  });

  it('shows slash suffix completion and accepts with ArrowRight', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/no' } });

    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('te1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowRight' });
    expect(searchInput).toHaveValue('/note1');
  });

  it('shows slash continuation completion for exact match with children', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note3' } });

    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('/');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowRight' });
    expect(searchInput).toHaveValue('/note3/');
  });

  it('hides slash continuation completion for exact match without children', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note5' } });

    await waitFor(() => {
      expect(getInlineCompletion()).toBeNull();
    });
  });

  it('does not alter query on ArrowRight when inline completion is hidden', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    await waitFor(() => {
      expect(getInlineCompletion()).toBeNull();
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowRight' });
    expect(searchInput).toHaveValue('note');
  });

  it('hides inline completion during composition and restores it afterward', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('/');
    });

    fireEvent.compositionStart(searchInput);
    await waitFor(() => {
      expect(getInlineCompletion()).toBeNull();
    });

    fireEvent.compositionEnd(searchInput);
    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('/');
    });
  });

  it('ignores search hotkeys while composition is active', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await waitFor(() => {
      const active = screen.getByRole('option', { name: 'note1' });
      expect(active).toHaveAttribute('aria-selected', 'true');
      expect(searchInput).toHaveAttribute('aria-activedescendant', active.id);
    });

    fireEvent.compositionStart(searchInput);

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'note1' })).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'note1' }).id,
    );

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: 'note1' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('main'));
    expect(screen.getByTestId('editor-search-probe')).toHaveAttribute('data-zoom-note-id', '');

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).toHaveFocus();
    expect(document.activeElement).not.toHaveClass('editor-input');
  });

  it('hides inline completion when caret is not at input end', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/no' } });

    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('te1');
    });

    (searchInput as HTMLInputElement).setSelectionRange(1, 1);
    fireEvent.select(searchInput);

    await waitFor(() => {
      expect(getInlineCompletion()).toBeNull();
    });
  });

  it('hides inline completion when selection is non-collapsed', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/no' } });

    await waitFor(() => {
      expect(getInlineCompletion()?.dataset.inlineCompletionText).toBe('te1');
    });

    (searchInput as HTMLInputElement).setSelectionRange(1, 3);
    fireEvent.select(searchInput);

    await waitFor(() => {
      expect(getInlineCompletion()).toBeNull();
    });
  });

  it('filters slash results to notes matching the visible segment', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note1' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);
    expect(resultItems).toEqual(['note1']);
  });

  it('slash arrow cycling changes highlight without mutating query', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/');
    expect(Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'), (item) => item.textContent))
      .toEqual(['note1', 'note3', 'note5']);

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note5');
    expect(searchInput).toHaveValue('/');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/');
  });

  it('descends slash scope to highlighted note children after appending "/"', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveSearchResult()?.textContent).toBe('note3');
    expect(searchInput).toHaveValue('/');

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note4']);
      expect(getActiveSearchResult()?.textContent).toBe('note4');
      expect(searchInput).toHaveValue('//');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('//');
  });

  it('resolves slash descent from the changed query segment when pasting a trailing slash path', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.change(searchInput, { target: { value: '/note3/' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note4']);
      expect(getActiveSearchResult()?.textContent).toBe('note4');
      expect(searchInput).toHaveValue('/note3/');
    });
  });

  it('replaces an existing descended slash path from the new query segment', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note1/' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note2']);
      expect(getActiveSearchResult()?.textContent).toBe('note2');
    });

    fireEvent.change(searchInput, { target: { value: '/note3/' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note4']);
      expect(getActiveSearchResult()?.textContent).toBe('note4');
      expect(searchInput).toHaveValue('/note3/');
    });
  });

  it('keeps invalid trailing slash paths empty instead of falling back to root results', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/missing/' } });

    await screen.findByText('No matches');
    expect(getActiveSearchResult()).toBeNull();
    expect(searchInput).toHaveValue('/missing/');

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(searchInput).toHaveFocus();
  });

  it('recomputes slash scope when an earlier completed segment changes at the same depth', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note1/no' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note2']);
      expect(getActiveSearchResult()?.textContent).toBe('note2');
    });

    fireEvent.change(searchInput, { target: { value: '/note3/no' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note4']);
      expect(getActiveSearchResult()?.textContent).toBe('note4');
      expect(searchInput).toHaveValue('/note3/no');
    });
  });

  it('supports deeper slash scope descent without query auto-write', async () => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text: 'note2' },
          { noteId: 'note3', text: 'note3' },
          { noteId: 'note4', text: 'note4' },
          { noteId: 'note5', text: 'note5' },
          { noteId: 'note6', text: 'note6' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [
            { noteId: 'note1', text: 'note1' },
            { noteId: 'note3', text: 'note3' },
            { noteId: 'note5', text: 'note5' },
          ],
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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('/');

    fireEvent.change(searchInput, { target: { value: '//' } });
    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note4');
    });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('//');

    fireEvent.change(searchInput, { target: { value: '///' } });
    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note6');
    });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('///');
  });

  it('moves slash scope back up when trailing slash is removed', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.change(searchInput, { target: { value: '//' } });
    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note2']);
      expect(getActiveSearchResult()?.textContent).toBe('note2');
    });

    fireEvent.change(searchInput, { target: { value: '/' } });
    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note1', 'note3', 'note5']);
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });
  });

  it('moves highlight with arrows over flat results without wraparound', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'sdk1', text: 'sdk result' }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'sdk1', text: 'sdk result' }],
          sdk1: [],
        },
      },
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'sdk' } });

    await screen.findByTestId('document-search-results');
    const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
      .map((item) => item.textContent);

    expect(resultItems).toEqual(['sdk result']);
  });

  it('keeps no highlight for no-match query and Enter is a no-op', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'mainonly', text: 'main only' }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'mainonly', text: 'main only' }],
          mainonly: [],
        },
      },
      other: null,
    };

    const router = renderDocumentRoute();
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'main' } });

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('main only');
    });

    await router.navigate(createDocumentPath('other'));

    const otherSearchInput = await screen.findByRole('combobox', { name: 'Search document' });
    otherSearchInput.focus();
    fireEvent.change(otherSearchInput, { target: { value: 'main' } });

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No matches')).toBeNull();
    });

    fireEvent.keyDown(otherSearchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('other'));
  });

  it('waits for the first candidate snapshot before showing search results', async () => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      main: null,
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'fresh' } });

    globals.__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'fresh', text: 'fresh result' }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'fresh', text: 'fresh result' }],
          fresh: [],
        },
      },
    };

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No notes')).toBeNull();
    });

    globals.__remdoMockSearchCandidateEmitters?.main?.();

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('fresh result');
    });
  });

  it('waits for a fresh snapshot after invalidating current document candidates', async () => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'stale', text: 'shared result' }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'stale', text: 'shared result' }],
          stale: [],
        },
      },
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'result' } });

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      expect(getActiveSearchResult()?.textContent).toBe('shared result');
    });

    globals.__remdoMockSearchCandidateResetters?.main?.();

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No matches')).toBeNull();
      expect(screen.queryByText('No notes')).toBeNull();
    });

    globals.__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [{ noteId: 'fresh', text: 'fresh result' }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'fresh', text: 'fresh result' }],
          fresh: [],
        },
      },
    };
    globals.__remdoMockSearchCandidateEmitters?.main?.();

    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('fresh result');
    });
  });

  it('re-resolves slash scope path when switching documents', async () => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      other: {
        allCandidates: [
          { noteId: 'other1', text: 'other1' },
          { noteId: 'other2', text: 'other2' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'other1', text: 'other1' }],
          other1: [{ noteId: 'other2', text: 'other2' }],
          other2: [],
        },
      },
    };

    const router = renderDocumentRoute();
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });
    await waitFor(() => {
      expect(getActiveSearchResult()?.textContent).toBe('note1');
    });

    fireEvent.change(searchInput, { target: { value: '//' } });
    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note2']);
      expect(searchInput).toHaveValue('//');
    });

    await router.navigate(createDocumentPath('other'));

    const otherSearchInput = await screen.findByRole('combobox', { name: 'Search document' });
    otherSearchInput.focus();

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['other2']);
      expect(getActiveSearchResult()?.textContent).toBe('other2');
      expect(otherSearchInput).toHaveValue('//');
    });
  });

  it('re-resolves completed slash queries when switching documents', async () => {
    (
      globalThis as typeof globalThis & MockSearchGlobals
    ).__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [
          { noteId: 'note6', text: 'note6' },
          { noteId: 'note7', text: 'note7' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'note6', text: 'note6' }],
          note6: [{ noteId: 'note7', text: 'note7' }],
          note7: [],
        },
      },
      other: {
        allCandidates: [
          { noteId: 'other1', text: 'other1' },
          { noteId: 'other2', text: 'other2' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'other1', text: 'other1' }],
          other1: [{ noteId: 'other2', text: 'other2' }],
          other2: [],
        },
      },
    };

    const router = renderDocumentRoute();
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note6/' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note7']);
      expect(getActiveSearchResult()?.textContent).toBe('note7');
    });

    await router.navigate(createDocumentPath('other'));

    const otherSearchInput = await screen.findByRole('combobox', { name: 'Search document' });
    otherSearchInput.focus();

    await screen.findByText('No matches');
    expect(document.querySelectorAll('[data-search-result-item]')).toHaveLength(0);
    expect(otherSearchInput).toHaveValue('/note6/');

    fireEvent.keyDown(otherSearchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('other'));
  });

  it('recomputes completed slash paths when sdk candidates change', async () => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [
          { noteId: 'note1', text: 'note1' },
          { noteId: 'note2', text: 'note2' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'note1', text: 'note1' }],
          note1: [{ noteId: 'note2', text: 'note2' }],
          note2: [],
        },
      },
    };

    const router = renderDocumentRoute();
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note1/' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['note2']);
      expect(getActiveSearchResult()?.textContent).toBe('note2');
    });

    globals.__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [
          { noteId: 'renamed', text: 'renamed' },
          { noteId: 'note2', text: 'note2' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'renamed', text: 'renamed' }],
          renamed: [{ noteId: 'note2', text: 'note2' }],
          note2: [],
        },
      },
    };
    globals.__remdoMockSearchCandidateEmitters?.main?.();

    await screen.findByText('No matches');
    expect(document.querySelectorAll('[data-search-result-item]')).toHaveLength(0);
    expect(searchInput).toHaveValue('/note1/');

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('main'));
  });

  it('matches completed slash segments exactly instead of by substring', async () => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      main: {
        allCandidates: [
          { noteId: 'barfoo', text: 'barfoo' },
          { noteId: 'barfoo-child', text: 'barfoo child' },
          { noteId: 'foo', text: 'foo' },
          { noteId: 'foo-child', text: 'foo child' },
        ],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [
            { noteId: 'barfoo', text: 'barfoo' },
            { noteId: 'foo', text: 'foo' },
          ],
          barfoo: [{ noteId: 'barfoo-child', text: 'barfoo child' }],
          'barfoo-child': [],
          foo: [{ noteId: 'foo-child', text: 'foo child' }],
          'foo-child': [],
        },
      },
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/foo/' } });

    await waitFor(() => {
      const resultItems = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'))
        .map((item) => item.textContent);
      expect(resultItems).toEqual(['foo child']);
      expect(getActiveSearchResult()?.textContent).toBe('foo child');
    });
  });

  it('zooms to document root on Enter when query is exactly "/"', async () => {
    const router = renderDocumentRoute(createDocumentPath('main', 'note3'));

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
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

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    screen.getByTestId('editor-input-probe').remove();

    searchInput.focus();
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).not.toHaveFocus();
  });
});
