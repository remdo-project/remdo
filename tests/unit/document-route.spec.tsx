import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import DocumentRoute from '@/routes/DocumentRoute';
import { createDocumentPath } from '@/routing';

vi.mock('@/editor/Editor', async () => {
  const React = await import('react');

  interface MockEditorProps {
    docId: string;
    searchHighlightedNoteId?: string | null;
    searchModeActive?: boolean;
    zoomNoteId?: string | null;
  }

  function MockEditor({ docId, searchHighlightedNoteId, searchModeActive, zoomNoteId }: MockEditorProps) {
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
  const renderDocumentRoute = () => {
    const router = createMemoryRouter(
      [{ path: '/n/:docRef', element: <DocumentRoute /> }],
      { initialEntries: [createDocumentPath('main')] },
    );

    render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    );

    return router;
  };

  const getSearchProbe = () => screen.getByTestId('editor-search-probe');

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
      const probe = getSearchProbe();
      expect(probe.dataset.searchModeActive).toBe('false');
      expect(probe.dataset.searchHighlightedNoteId).toBe('');
    });
  });

  it('initializes search highlight to the first visible note on focus', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      const probe = getSearchProbe();
      expect(probe.dataset.searchModeActive).toBe('true');
      expect(probe.dataset.searchHighlightedNoteId).toBe('note1');
    });
  });

  it('moves highlight with arrows over visible notes without wraparound', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();

    await waitFor(() => {
      expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note3');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note5');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note3');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note1');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('note1');
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

  it('keeps no highlight for no-match query and Enter is a no-op', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    await screen.findByText('No matches');
    expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('');

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('main'));
    expect(searchInput).toHaveFocus();
  });

  it('refreshes candidates when editor input appears after search mode starts', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    const editorInput = screen.getByTestId('editor-input-probe');
    const restoredEditorInput = editorInput.cloneNode(true) as HTMLElement;
    editorInput.remove();

    searchInput.focus();
    await waitFor(() => {
      expect(getSearchProbe().dataset.searchModeActive).toBe('true');
      expect(getSearchProbe().dataset.searchHighlightedNoteId).toBe('');
    });

    const shell = searchInput.closest('.document-editor-shell');
    shell!.append(restoredEditorInput);

    fireEvent.change(searchInput, { target: { value: 'note1' } });

    await waitFor(() => {
      const active = document.querySelector<HTMLElement>('[data-search-result-item][data-search-result-active="true"]');
      expect(active?.textContent).toBe('note1');
    });
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

  it('ends search mode on blur and hides flat results', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('textbox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'note' } });
    await screen.findByTestId('document-search-results');

    fireEvent.blur(searchInput);

    await waitFor(() => {
      const probe = getSearchProbe();
      expect(probe.dataset.searchModeActive).toBe('false');
      expect(probe.dataset.searchHighlightedNoteId).toBe('');
    });
    expect(screen.queryByTestId('document-search-results')).toBeNull();
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
