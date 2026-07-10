import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentPath } from '#document-routes';
import {
  ROOT_SEARCH_SCOPE_ID,
  findResultByLabel,
  getResultLabels,
  renderDocumentRoute,
  resetDocumentRouteHarness,
} from './_support/document-route-harness';
import type {
  MockSearchGlobals,
  TestSearchSnapshot,
} from './_support/document-route-harness';

describe('search result row', () => {

  beforeEach(() => {
    resetDocumentRouteHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('result row context', () => {
    const setSnapshot = (snapshot: TestSearchSnapshot) => {
      (globalThis as typeof globalThis & MockSearchGlobals).__remdoMockSearchCandidatesByDoc = {
        routeDoc: snapshot,
      };
    };

    const contextSnapshot: TestSearchSnapshot = {
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'root', text: 'Work' }],
        root: [{ noteId: 'mid', text: 'Q3 planning' }],
        mid: [{ noteId: 'mid2', text: 'Roadmap' }],
        mid2: [{ noteId: 'mid3', text: 'Grooming' }],
        mid3: [{ noteId: 'mid4', text: 'Estimates' }],
        mid4: [{ noteId: 'parent', text: 'Sprint backlog' }],
        parent: [{ noteId: 'match', text: 'TODO refine estimates' }],
        match: [
          { noteId: 'c1', text: 'sub one', listType: 'number' },
          { noteId: 'c2', text: 'sub two', listType: 'check', checked: true },
          { noteId: 'c3', text: 'sub three' },
        ],
        c1: [],
        c2: [],
        c3: [],
      },
    };

    it('gives every result the same two-line layout regardless of highlight', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'sub' } });

      // 'sub two' is not the highlighted row, yet it still renders the match label
      // line plus its ancestor subline — moving the highlight never re-lays-out.
      const subTwo = await findResultByLabel('sub two');
      expect(subTwo.getAttribute('data-search-result-active')).toBeNull();
      const matchLine = subTwo.querySelector('[data-search-result-match]');
      expect(matchLine?.textContent).toBe('sub two');
      expect(subTwo.querySelector('.document-search-result-breadcrumb')).not.toBeNull();
    });

    it('renders the match label without a list marker', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await findResultByLabel('TODO refine estimates');
      const matchLine = active.querySelector('[data-search-result-match]');
      // The label is a plain element, not an outline list item — no bullet/number.
      expect(matchLine?.tagName).toBe('DIV');
      expect(matchLine?.querySelector('.list-item')).toBeNull();
      expect(active.querySelector('.document-search-result-match ul, .document-search-result-match ol'))
        .toBeNull();
    });

    it('strikes through the match label when the matched note is checked', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'sub' } });

      // 'sub two' is a checked note → its label carries data-note-checked (the CSS
      // strikes it through), even though it has no list marker.
      const subTwo = await findResultByLabel('sub two');
      const matchLine = subTwo.querySelector('[data-search-result-match]');
      expect(matchLine?.getAttribute('data-note-checked')).toBe('true');
    });

    it('expands the highlighted row with a truncating subline and child preview', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await findResultByLabel('TODO refine estimates');
      // Subline excludes only the match, leaving Work / Q3 / Roadmap / Grooming /
      // Estimates / Sprint backlog (6) → first-2 + ⋯ + last-2.
      const crumbs = active.querySelectorAll('.document-search-result-crumb');
      const crumbText = Array.from(crumbs, (crumb) => crumb.textContent);
      expect(crumbText).toContain('⋯');
      expect(crumbText.at(0)).toBe('Work');
      expect(crumbText.at(-1)).toBe('Sprint backlog');
      expect(crumbText).not.toContain('TODO refine estimates');

      const ellipsis = active.querySelector('.document-search-result-crumb--ellipsis');
      expect(ellipsis?.getAttribute('title')).toBe('Roadmap / Grooming');

      const childTexts = Array.from(
        active.querySelectorAll('.document-search-result-children .list-item'),
        (child) => child.textContent
      );
      expect(childTexts).toEqual(['sub one', 'sub two']);
      expect(active.querySelector('.document-search-result-children-more')?.textContent)
        .toBe('+1 more');
    });

    it('keeps the top-level ancestor and separates subline crumbs with a slash', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await findResultByLabel('TODO refine estimates');
      // The full chain is shown, starting at the top-level note 'Work'.
      const ancestorLabels = Array.from(
        active.querySelectorAll('[data-search-result-ancestor-crumb]'),
        (crumb) => crumb.textContent
      );
      expect(ancestorLabels[0]).toBe('Work');

      const separators = active.querySelectorAll('.document-search-result-crumb-separator');
      expect(separators.length).toBeGreaterThan(0);
      separators.forEach((sep) => expect(sep.textContent).toBe('/'));
    });

    it('renders child preview with the editor list markup per child list type', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await findResultByLabel('TODO refine estimates');
      // Preview reuses the shared outline classes so list markers match the editor.
      expect(active.querySelector('.document-search-result-children.remdo-outline')).not.toBeNull();
      // First child is a number-list item → ol.list-ol; second is a checked item.
      expect(active.querySelector('ol.list-ol > .list-item')?.textContent).toBe('sub one');
      const checked = active.querySelector('.list-item.list-item-checked');
      expect(checked?.textContent).toBe('sub two');
    });

    it('highlights the matched query term inside the result text', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'sub' } });

      const subTwo = await findResultByLabel('sub two');
      const mark = subTwo.querySelector('.document-search-result-mark');
      expect(mark?.textContent).toBe('sub');
    });

    it('matches multiple tokens order-independently and highlights each', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      // 'TODO refine estimates' matches the out-of-order, whitespace-padded query.
      fireEvent.change(searchInput, { target: { value: '  estimates   todo ' } });

      const match = await findResultByLabel('TODO refine estimates');
      const labelMarks = Array.from(
        match.querySelectorAll('[data-search-result-match] .document-search-result-mark'),
        (m) => m.textContent
      );
      expect(labelMarks).toEqual(['TODO', 'estimates']);
    });

    it('highlights tokens that matched an ancestor inside its crumb', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      // 'todo' hits the match itself (leaf guard); 'estimates' also hits the
      // 'Estimates' ancestor crumb, which is highlighted there too.
      fireEvent.change(searchInput, { target: { value: 'estimates todo' } });

      const match = await findResultByLabel('TODO refine estimates');
      const crumbMarks = Array.from(
        match.querySelectorAll('[data-search-result-ancestor-crumb] .document-search-result-mark'),
        (m) => m.textContent
      );
      expect(crumbMarks).toEqual(['Estimates']);
    });

    it('matches a note via an ancestor token as long as one token hits the note', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      // 'work' matches only the 'Work' ancestor; 'todo' matches the note itself.
      fireEvent.change(searchInput, { target: { value: 'work todo' } });

      await waitFor(() => {
        expect(getResultLabels()).toEqual(['TODO refine estimates']);
      });
    });

    it('excludes descendants whose only match is an ancestor token', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      // 'work' hits the 'Work' note itself, so it matches; its descendants have
      // 'work' only in their ancestor path, so the leaf-first guard drops them.
      fireEvent.change(searchInput, { target: { value: 'work' } });

      await waitFor(() => {
        expect(getResultLabels()).toEqual(['Work']);
      });
    });

    it('highlights a match past the navigation label length cap on the expanded row', async () => {
      const longText = `${'x'.repeat(60)} needle tail`;
      setSnapshot({
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'long', text: longText }],
          long: [],
        },
      });
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'needle' } });

      const active = await screen.findByRole('option', { name: longText });
      const mark = active.querySelector('.document-search-result-mark');
      expect(mark?.textContent).toBe('needle');
    });

    it('keeps the full ancestor label on the crumb and its tooltip for CSS clipping', async () => {
      const longAncestor = 'Engineering '.repeat(8).trim(); // > 48 chars, no hard cap
      setSnapshot({
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'parent', text: longAncestor }],
          parent: [{ noteId: 'child', text: 'sprint task' }],
          child: [],
        },
      });
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'sprint' } });

      const active = await findResultByLabel('sprint task');
      const crumb = active.querySelector<HTMLElement>('[data-search-result-ancestor-crumb]');
      expect(crumb).not.toBeNull();
      // Full label (not the 48-char "..." form): CSS handles the visual ellipsis,
      // and the tooltip must recover the complete text.
      expect(crumb!.textContent).toBe(longAncestor);
      expect(crumb!.getAttribute('title')).toBe(longAncestor);
      expect(crumb!.textContent).not.toContain('...');
    });

    it('distinguishes same-text results by ancestor context in the accessible name', async () => {
      setSnapshot({
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

      // Both rows share the text "Plan"; the accessible name carries the ancestor
      // path so screen-reader users can still tell them apart.
      await screen.findByRole('option', { name: 'Plan, in Work' });
      await screen.findByRole('option', { name: 'Plan, in Home' });
    });

    it('zooms to an ancestor crumb and closes search when clicked', async () => {
      setSnapshot(contextSnapshot);
      const router = renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await findResultByLabel('TODO refine estimates');
      const ancestorCrumb = Array.from(
        active.querySelectorAll<HTMLElement>('[data-search-result-ancestor-crumb]')
      ).find((crumb) => crumb.textContent === 'Q3 planning');
      expect(ancestorCrumb).toBeDefined();

      fireEvent.click(ancestorCrumb!);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'mid'));
        expect(screen.queryByTestId('document-search-results')).toBeNull();
      });
    });

    it('prevents default on crumb mousedown so the search input keeps focus', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await findResultByLabel('TODO refine estimates');
      const ancestorCrumb = Array.from(
        active.querySelectorAll<HTMLElement>('[data-search-result-ancestor-crumb]')
      ).find((crumb) => crumb.textContent === 'Q3 planning');
      expect(ancestorCrumb).toBeDefined();

      // mousedown must be default-prevented: otherwise the focusable crumb button
      // steals focus, blurs the search input, and the dismiss-on-blur unmounts the
      // results before the crumb's click can zoom. fireEvent returns false when a
      // handler called preventDefault.
      const notPrevented = fireEvent.mouseDown(ancestorCrumb!);
      expect(notPrevented).toBe(false);
    });
  });

});
