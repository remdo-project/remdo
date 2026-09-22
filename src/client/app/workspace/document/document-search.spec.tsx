import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentPath } from '#document-routes';
import {
  createSearchResult,
  findResultByLabel,
  getActiveResultLabel,
  getActiveSearchResult,
  getResultByLabel,
  getResultLabels,
  mockDocumentSearch,
  renderDocumentRoute,
  resetDocumentRouteHarness,
  setMockDocumentAvailable,
} from '../../../../../tests/unit/_support/document-route-harness';
import { createDeferred } from '../../../../../tests/unit/_support/deferred';

async function openSearch() {
  const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
  act(() => searchInput.focus());
  return searchInput;
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

    const searchInput = await openSearch();
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).not.toHaveFocus();
    expect(document.activeElement).toHaveClass('editor-input');
  });

  it('moves focus to editor on Escape in flat results when editor pane is hidden', async () => {
    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    await findResultByLabel('note1');

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

  it('evaluates the SDK only on demand and evaluates again when search reopens', async () => {
    const search = mockDocumentSearch('routeDoc');
    renderDocumentRoute();

    await screen.findByTestId('editor-probe');
    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });

    expect(search).not.toHaveBeenCalled();

    act(() => searchInput.focus());
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith({ query: '', limit: 10, childPreviewLimit: 2 });
    });

    fireEvent.blur(searchInput);
    search.mockClear();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    expect(search).not.toHaveBeenCalled();

    fireEvent.focus(searchInput);
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith({ query: 'note', limit: 10, childPreviewLimit: 2 });
    });
  });

  it('renders SDK results and highlights the first item on an empty query', async () => {
    renderDocumentRoute();

    await openSearch();

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      expect(getActiveResultLabel()).toBe('note1');
    });

    const resultItems = getResultLabels();
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
  });

  it('distinguishes same-text results by ancestor context in the accessible name', async () => {
    const work = createSearchResult('work', 'Work');
    const home = createSearchResult('home', 'Home');
    const workPlan = createSearchResult('work-plan', 'Plan');
    const homePlan = createSearchResult('home-plan', 'Plan');
    mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [
        { ...workPlan, path: [work.note, workPlan.note] },
        { ...homePlan, path: [home.note, homePlan.note] },
      ],
      hasMore: false,
    });
    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'Plan' } });

    await screen.findByRole('option', { name: 'Plan, in Work' });
    await screen.findByRole('option', { name: 'Plan, in Home' });
  });

  it('announces the body preview so a body-only match explains itself', async () => {
    // The option's aria-label replaces its contents for assistive tech, so a
    // note whose label lacks the query would otherwise be announced with no
    // sign of why it matched.
    const result = createSearchResult('note1', 'Send report');
    mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [{ ...result, note: { ...result.note, body: 'cc the finance team' } }],
      hasMore: false,
    });
    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'finance' } });

    await screen.findByRole('option', { name: 'Send report, cc the finance team' });
  });

  it('marks non-leaf flat results with a children hint flag', async () => {
    renderDocumentRoute();

    await openSearch();

    await findResultByLabel('note1');

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

    const searchInput = await openSearch();

    const resultsListbox = await screen.findByRole('listbox', { name: 'Search results' });
    expect(searchInput).toHaveAttribute('aria-haspopup', 'listbox');
    expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    expect(searchInput).toHaveAttribute('aria-controls', resultsListbox.id);

    const firstOption = await screen.findByRole('option', { name: 'note1' });
    expect(firstOption).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', firstOption.id);

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    const secondOption = getResultByLabel('note2');
    await waitFor(() => {
      expect(firstOption).toHaveAttribute('aria-selected', 'false');
      expect(secondOption).toHaveAttribute('aria-selected', 'true');
      expect(searchInput).toHaveAttribute('aria-activedescendant', secondOption.id);
    });
  });

  it('keeps the first matching result highlighted when recovering from no matches', async () => {
    const search = mockDocumentSearch('routeDoc');
    search.mockResolvedValue({ flatResults: [], hasMore: false });
    const router = renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'zzzz' } });
    await screen.findByText('No matches');

    search.mockResolvedValue({ flatResults: [createSearchResult('note1', 'note1')], hasMore: false });
    fireEvent.change(searchInput, { target: { value: 'note' } });

    const firstOption = await screen.findByRole('option', { name: 'note1' });
    expect(firstOption).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', firstOption.id);

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'note1'));
    });
  });

  it('keeps the search popup exposed as a listbox when there are no matches', async () => {
    mockDocumentSearch('routeDoc').mockResolvedValue({ flatResults: [], hasMore: false });
    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'zzzz' } });

    const resultsListbox = await screen.findByRole('listbox', { name: 'Search results' });
    const emptyOption = await screen.findByRole('option', { name: 'No matches' });

    expect(searchInput).toHaveAttribute('aria-controls', resultsListbox.id);
    expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    expect(emptyOption).toHaveAttribute('aria-disabled', 'true');
  });

  it('zooms to a clicked search result and closes search', async () => {
    const router = renderDocumentRoute();

    const searchInput = await openSearch();
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
    const setManyNotes = () => {
      mockDocumentSearch('routeDoc').mockResolvedValue({
        flatResults: Array.from({ length: 10 }, (_unused, index) => {
          const id = `note${String(index + 1).padStart(2, '0')}`;
          return createSearchResult(id, id);
        }),
        hasMore: true,
      });
    };

    it('renders the SDK result limit hint without making it a navigable option', async () => {
      setManyNotes();
      renderDocumentRoute();

      await openSearch();

      await findResultByLabel('note01');

      const labels = getResultLabels();
      expect(labels).toEqual([
        'note01', 'note02', 'note03', 'note04', 'note05',
        'note06', 'note07', 'note08', 'note09', 'note10',
      ]);

      const truncation = document.querySelector<HTMLElement>('[data-search-result-truncation]');
      expect(truncation?.textContent).toBe('Showing the first 10 — refine your search');
      expect(truncation?.getAttribute('role')).not.toBe('option');
    });

    it('stops arrow navigation at the capped tenth result', async () => {
      setManyNotes();
      renderDocumentRoute();

      const searchInput = await openSearch();
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

      await openSearch();
      await findResultByLabel('note1');

      expect(document.querySelector('[data-search-result-truncation]')).toBeNull();
    });
  });

  it('dismisses search on outside primary click without changing the route', async () => {
    const router = renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await findResultByLabel('note1');

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

    const searchInput = await openSearch();
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

    const searchInput = await openSearch();

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

    const searchInput = await openSearch();
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

  it('renders every returned result while the editor pane is hidden', async () => {
    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await findResultByLabel('note1');
    const resultItems = getResultLabels();
    expect(resultItems).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
    expect(document.querySelector('.document-editor-pane--hidden')).not.toBeNull();
  });

  it('renders SDK search results rather than reading the editor DOM', async () => {
    mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [createSearchResult('sdk1', 'sdk result')],
      hasMore: false,
    });

    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'sdk' } });

    await findResultByLabel('sdk result');
    const resultItems = getResultLabels();

    expect(resultItems).toEqual(['sdk result']);
  });

  it('keeps no highlight for no-match query and Enter is a no-op', async () => {
    mockDocumentSearch('routeDoc').mockResolvedValue({ flatResults: [], hasMore: false });
    const router = renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    await screen.findByText('No matches');
    expect(getActiveSearchResult()).toBeNull();

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
    expect(searchInput).toHaveFocus();
  });

  it('clears previous results when switching to an unavailable document', async () => {
    mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [createSearchResult('mainonly', 'main only')],
      hasMore: false,
    });
    setMockDocumentAvailable('other', false);

    const router = renderDocumentRoute();
    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'main' } });

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('main only');
    });

    await router.navigate(createDocumentPath('other'));

    const otherSearchInput = await openSearch();
    fireEvent.change(otherSearchInput, { target: { value: 'main' } });

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No matches')).toBeNull();
    });

    fireEvent.keyDown(otherSearchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('other'));
  });

  it('evaluates the current query when the document first becomes available', async () => {
    setMockDocumentAvailable('routeDoc', false);
    const search = mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [createSearchResult('fresh', 'fresh result')],
      hasMore: false,
    });

    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'fresh' } });

    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByTestId('document-search-results')).toBeNull();
    expect(screen.queryByText('No notes')).toBeNull();
    expect(screen.queryByText('No matches')).toBeNull();

    act(() => setMockDocumentAvailable('routeDoc', true));

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('fresh result');
    });
    expect(search).toHaveBeenLastCalledWith({ query: 'fresh', limit: 10, childPreviewLimit: 2 });
  });

  it('clears results on source withdrawal and evaluates again after recovery', async () => {
    const search = mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [createSearchResult('stale', 'shared result')],
      hasMore: false,
    });

    renderDocumentRoute();

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'result' } });

    await waitFor(() => {
      expect(screen.getByTestId('document-search-results')).toBeInTheDocument();
      expect(getActiveResultLabel()).toBe('shared result');
    });

    act(() => setMockDocumentAvailable('routeDoc', false));

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No matches')).toBeNull();
      expect(screen.queryByText('No notes')).toBeNull();
    });

    search.mockResolvedValue({ flatResults: [createSearchResult('fresh', 'fresh result')], hasMore: false });
    act(() => setMockDocumentAvailable('routeDoc', true));

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('fresh result');
    });
  });

  it('ignores a slower evaluation after a newer query has completed', async () => {
    const older = createDeferred();
    const search = mockDocumentSearch('routeDoc');
    renderDocumentRoute();
    const searchInput = await openSearch();
    await findResultByLabel('note1');

    search.mockImplementationOnce(() => older.promise.then(() => ({
      flatResults: [createSearchResult('old', 'older result')], hasMore: false,
    })));
    fireEvent.change(searchInput, { target: { value: 'older' } });

    search.mockResolvedValue({ flatResults: [createSearchResult('new', 'newer result')], hasMore: false });
    fireEvent.change(searchInput, { target: { value: 'newer' } });
    await findResultByLabel('newer result');

    await act(async () => older.resolve());
    expect(getResultLabels()).toEqual(['newer result']);
  });

  it('does not present an earlier empty answer while the current query is pending', async () => {
    const current = createDeferred();
    const search = mockDocumentSearch('routeDoc').mockResolvedValue({ flatResults: [], hasMore: false });
    const router = renderDocumentRoute();
    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'missing' } });
    await screen.findByText('No matches');

    search.mockImplementationOnce(() => current.promise.then(() => ({
      flatResults: [createSearchResult('current', 'current result')], hasMore: false,
    })));
    fireEvent.change(searchInput, { target: { value: 'current' } });

    expect(screen.queryByText('No matches')).toBeNull();
    expect(screen.queryByText('No notes')).toBeNull();
    expect(getActiveSearchResult()).toBeNull();
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));

    await act(async () => current.resolve());
    await findResultByLabel('current result');
  });

  it.each(['while closed', 'after reopening'])('ignores a previous opening\'s completion %s', async (timing) => {
    const previous = createDeferred();
    const search = mockDocumentSearch('routeDoc').mockImplementationOnce(() => previous.promise.then(() => ({
      flatResults: [createSearchResult('old', 'previous opening')], hasMore: false,
    })));
    renderDocumentRoute();
    const searchInput = await openSearch();
    fireEvent.keyDown(searchInput, { key: 'Escape' });

    if (timing === 'after reopening') {
      search.mockResolvedValue({ flatResults: [createSearchResult('new', 'fresh opening')], hasMore: false });
      act(() => searchInput.focus());
      await findResultByLabel('fresh opening');
    }

    await act(async () => previous.resolve());
    expect(getResultLabels()).toEqual(timing === 'while closed' ? [] : ['fresh opening']);
    if (timing === 'while closed') {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(searchInput).not.toHaveFocus();
    }
  });

  it('ignores a withdrawn source\'s pending evaluation after that source recovers', async () => {
    const previous = createDeferred();
    const search = mockDocumentSearch('routeDoc').mockImplementationOnce(() => previous.promise.then(() => ({
      flatResults: [createSearchResult('old', 'before withdrawal')], hasMore: false,
    })));
    renderDocumentRoute();
    await openSearch();

    act(() => setMockDocumentAvailable('routeDoc', false));
    expect(screen.queryByTestId('document-search-results')).toBeNull();
    search.mockResolvedValue({ flatResults: [createSearchResult('fresh', 'after recovery')], hasMore: false });
    act(() => setMockDocumentAvailable('routeDoc', true));
    await findResultByLabel('after recovery');

    await act(async () => previous.resolve());
    expect(getResultLabels()).toEqual(['after recovery']);
  });

  it('does not show an empty answer on failure and retries when the query changes', async () => {
    const search = mockDocumentSearch('routeDoc').mockRejectedValue(new Error('Search unavailable'));
    renderDocumentRoute();
    const searchInput = await openSearch();
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'failed' } });
    });

    expect(screen.queryByText('No matches')).toBeNull();
    expect(screen.queryByText('No notes')).toBeNull();
    expect(getActiveSearchResult()).toBeNull();

    search.mockResolvedValue({ flatResults: [createSearchResult('fresh', 'available result')], hasMore: false });
    fireEvent.change(searchInput, { target: { value: 'available' } });
    await findResultByLabel('available result');
  });

  it('zooms to highlighted flat result on Enter and moves focus to editor', async () => {
    mockDocumentSearch('routeDoc').mockResolvedValue({
      flatResults: [createSearchResult('note3', 'note3')],
      hasMore: false,
    });
    const router = renderDocumentRoute();

    const searchInput = await openSearch();
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

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    await findResultByLabel('note1');

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
