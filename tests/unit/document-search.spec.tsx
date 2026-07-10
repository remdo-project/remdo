import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentPath } from '#document-routes';
import {
  ROOT_SEARCH_SCOPE_ID,
  findResultByLabel,
  getActiveResultLabel,
  getActiveSearchResult,
  getResultByLabel,
  getResultLabels,
  refreshMockSearchNotes,
  renderDocumentRoute,
  resetDocumentRouteHarness,
  setMockSearchSnapshot,
} from './_support/document-route-harness';
import type { TestSearchSnapshot } from './_support/document-route-harness';

function setSearchSnapshot(snapshot: TestSearchSnapshot) {
  setMockSearchSnapshot('routeDoc', snapshot);
}

describe('document search', () => {

  beforeEach(() => {
    resetDocumentRouteHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
      expect(getActiveResultLabel()).toBe('note1');
    });

    const resultItems = getResultLabels();
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
  });

  it('uses ancestor tokens only when another token matches the note itself', async () => {
    setSearchSnapshot({
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'work', text: 'Work' }],
        work: [{ noteId: 'match', text: 'TODO refine estimates' }],
        match: [],
      },
    });
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'work todo' } });
    await waitFor(() => {
      expect(getResultLabels()).toEqual(['TODO refine estimates']);
    });

    fireEvent.change(searchInput, { target: { value: 'work' } });
    await waitFor(() => {
      expect(getResultLabels()).toEqual(['Work']);
    });
  });

  it('distinguishes same-text results by ancestor context in the accessible name', async () => {
    setSearchSnapshot({
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [
          { noteId: 'work', text: 'Work' },
          { noteId: 'home', text: 'Home' },
        ],
        work: [{ noteId: 'work-plan', text: 'Plan' }],
        'work-plan': [],
        home: [{ noteId: 'home-plan', text: 'Plan' }],
        'home-plan': [],
      },
    });
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'Plan' } });

    await screen.findByRole('option', { name: 'Plan, in Work' });
    await screen.findByRole('option', { name: 'Plan, in Home' });
  });

  it('marks non-leaf flat results with a children hint flag', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
    });

    const results = Array.from(document.querySelectorAll<HTMLElement>('[data-search-result-item]'));
    const note1 = results.find((item) => item.getAttribute('data-search-result-label') === 'note1');
    const note2 = results.find((item) => item.getAttribute('data-search-result-label') === 'note2');
    const note3 = results.find((item) => item.getAttribute('data-search-result-label') === 'note3');
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

    const secondOption = getResultByLabel('note2');
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
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'note1'));
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
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
    expect(screen.getByTestId('document-search-results')).toBeInTheDocument();

    // mousedown must be default-prevented so the press doesn't blur the search
    // input and dismiss the results before the click can zoom (jsdom can't model
    // the native blur, so assert the guard directly; the e2e covers the real
    // trusted-click path).
    const notPrevented = fireEvent.mouseDown(result);
    expect(notPrevented).toBe(false);

    fireEvent.click(result);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'note3'));
      expect(screen.queryByTestId('document-search-results')).toBeNull();
    });
  });


  describe('result limit', () => {
    // A flat document of 12 top-level notes: 'note01'..'note12'. Empty query
    // matches every one, so it exercises the cap (10) plus truncation hint.
    const manyNotesSnapshot = (): TestSearchSnapshot => {
      const ids = Array.from({ length: 12 }, (_unused, i) => `note${String(i + 1).padStart(2, '0')}`);
      return {
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: ids.map((id) => ({ noteId: id, text: id })),
          ...Object.fromEntries(ids.map((id) => [id, []])),
        },
      };
    };

    const setManyNotes = () => {
      setMockSearchSnapshot('routeDoc', manyNotesSnapshot());
    };

    it('caps flat results at ten and flags that more matches exist', async () => {
      setManyNotes();
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();

      await waitFor(() => {
        expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      });

      // Only the first ten notes in document order render as result rows.
      const labels = getResultLabels();
      expect(labels).toEqual([
        'note01', 'note02', 'note03', 'note04', 'note05',
        'note06', 'note07', 'note08', 'note09', 'note10',
      ]);

      // The truncation row reports that more matches exist (without an exact
      // total, since the capped walk stops early) and is not a navigable option.
      const truncation = document.querySelector<HTMLElement>('[data-search-result-truncation]');
      expect(truncation?.textContent).toBe('Showing the first 10 — refine your search');
      expect(truncation?.getAttribute('role')).not.toBe('option');
    });

    it('stops arrow navigation at the capped tenth result', async () => {
      setManyNotes();
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      await waitFor(() => {
        expect(getActiveResultLabel()).toBe('note01');
      });

      // Pressing ArrowDown past the cap settles on the tenth row, never the
      // eleventh/twelfth (which are not rendered or navigable).
      for (let i = 0; i < 15; i += 1) {
        fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      }
      await waitFor(() => {
        expect(getActiveResultLabel()).toBe('note10');
      });
    });

    it('omits the truncation row when results fit within the cap', async () => {
      // The default route fixture has five notes — fewer than the cap.
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      await waitFor(() => {
        expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      });

      expect(document.querySelector('[data-search-result-truncation]')).toBeNull();
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
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
      expect(screen.queryByTestId('document-search-results')).toBeNull();
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
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
    expect(screen.getByTestId('editor-search-probe')).toHaveAttribute('data-zoom-note-id', '');

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).toHaveFocus();
    expect(document.activeElement).not.toHaveClass('editor-input');
  });

  it('moves highlight with arrows over flat results without wraparound', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note2');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note3');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveResultLabel()).toBe('note4');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveResultLabel()).toBe('note1');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveResultLabel()).toBe('note1');
  });

  it('highlights a flat result on hover, like arrow navigation', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.mouseEnter(await findResultByLabel('note4'));
    expect(getActiveResultLabel()).toBe('note4');

    fireEvent.mouseEnter(await findResultByLabel('note2'));
    expect(getActiveResultLabel()).toBe('note2');

    // Hover does not move focus out of the search box (Search Mode stays open).
    expect(searchInput).toHaveFocus();
    expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
  });

  it('shows flat results across the whole document while query is non-empty', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await screen.findByTestId('document-search-results');
    const resultItems = getResultLabels();
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
    expect(document.querySelector('.document-editor-pane--hidden')).not.toBeNull();
  });

  it('uses sdk-provided candidates for flat results', async () => {
    setMockSearchSnapshot('routeDoc', {
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'sdk1', text: 'sdk result' }],
        sdk1: [],
      },
    });

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'sdk' } });

    await screen.findByTestId('document-search-results');
    const resultItems = getResultLabels();

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
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
    expect(searchInput).toHaveFocus();
  });

  it('clears stale sdk candidates when switching documents', async () => {
    setMockSearchSnapshot('routeDoc', {
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'mainonly', text: 'main only' }],
        mainonly: [],
      },
    });
    setMockSearchSnapshot('other', null);

    const router = renderDocumentRoute();
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'main' } });

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('main only');
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
    setMockSearchSnapshot('routeDoc', null);

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'fresh' } });

    setMockSearchSnapshot('routeDoc', {
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'fresh', text: 'fresh result' }],
        fresh: [],
      },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No notes')).toBeNull();
    });

    refreshMockSearchNotes('routeDoc');

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('fresh result');
    });
  });

  it('waits for a fresh snapshot after invalidating current document candidates', async () => {
    setMockSearchSnapshot('routeDoc', {
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'stale', text: 'shared result' }],
        stale: [],
      },
    });

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'result' } });

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      expect(getActiveResultLabel()).toBe('shared result');
    });

    // Invalidate: candidates become unavailable, then refresh clears the reader.
    setMockSearchSnapshot('routeDoc', null);
    refreshMockSearchNotes('routeDoc');

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No matches')).toBeNull();
      expect(screen.queryByText('No notes')).toBeNull();
    });

    setMockSearchSnapshot('routeDoc', {
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'fresh', text: 'fresh result' }],
        fresh: [],
      },
    });
    refreshMockSearchNotes('routeDoc');

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('fresh result');
    });
  });

  it('zooms to highlighted flat result on Enter and moves focus to editor', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note3' } });

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note3');
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'note3'));
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
