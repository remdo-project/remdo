import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTestUserData,
  setTestDocumentSources,
  setTestDocumentSourcesLoading,
} from '#tests';
import { createDocumentPath, createDocumentSyncTokenApiPath } from '#document-routes';
import {
  createDocumentCollectionSource,
  renderDocumentRoute,
  renderDocumentRouteWithResult,
  resetDocumentRouteHarness,
} from './_support/document-route-harness';
import type { MockSearchGlobals } from './_support/document-route-harness';

describe('document route', () => {

  beforeEach(() => {
    resetDocumentRouteHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to the route document id in the page title at the root', async () => {
    renderDocumentRoute();

    await waitFor(() => {
      expect(document.title).toBe('routeDoc · RemDo');
    });
  });

  it('uses listed document titles instead of route document ids in the page title', async () => {
    const createdDocument = await getTestUserData().documents().create('  Project\nNotes  ');
    renderDocumentRoute(createDocumentPath(createdDocument.id()));

    await waitFor(() => {
      expect(document.title).toBe('Project Notes · RemDo');
    });
  });

  it('opens linked source documents through plain document routes', async () => {
    setTestDocumentSources([{
      baseUrl: 'https://source.example',
      documents: createDocumentCollectionSource([{ id: 'sourceDoc', title: 'Source Document' }]),
      id: 'source',
      label: 'Source Server',
      local: false,
    }]);
    const router = renderDocumentRoute(createDocumentPath('testDoc'));

    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));
    fireEvent.click(await screen.findByRole('option', { hidden: true, name: 'Source Document' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('sourceDoc'));
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-doc-id', 'sourceDoc');
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-source-id', 'source');
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-source-origin', 'https://source.example');
    });
  });

  it('waits for source resolution before opening a source-only plain document route', async () => {
    setTestDocumentSourcesLoading(true);

    renderDocumentRoute(createDocumentPath('sourceDoc'));

    expect(await screen.findByRole('status')).toHaveTextContent('Loading document');
    expect(screen.queryByTestId('editor-probe')).toBeNull();

    act(() => {
      setTestDocumentSources([{
        baseUrl: 'https://source.example',
        documents: createDocumentCollectionSource([{ id: 'sourceDoc', title: 'Source Document' }]),
        id: 'source',
        label: 'Source Server',
        local: false,
      }]);
      setTestDocumentSourcesLoading(false);
    });

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-doc-id', 'sourceDoc');
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-source-id', 'source');
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-source-origin', 'https://source.example');
    });
  });

  it('opens an authorized local document while source resolution is loading', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setTestDocumentSourcesLoading(true);

    renderDocumentRoute(createDocumentPath('sharedDoc'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-doc-id', 'sharedDoc');
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-source-id', '');
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      createDocumentSyncTokenApiPath('sharedDoc'),
      expect.objectContaining({
        body: JSON.stringify({ docId: 'sharedDoc' }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    );
  });

  it('opens the editor offline while source resolution is loading', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false);
    setTestDocumentSourcesLoading(true);

    renderDocumentRoute(createDocumentPath('offlineDoc'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-doc-id', 'offlineDoc');
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-source-id', '');
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets the page title from the current zoom note when zoomed', async () => {
    (globalThis as typeof globalThis & MockSearchGlobals).__remdoMockZoomPathByDoc = {
      routeDoc: {
        note3: [
          { noteId: 'note1', label: 'Parent' },
          { noteId: 'note3', label: '  Current\nNote  ' },
        ],
      },
    };

    renderDocumentRoute(createDocumentPath('routeDoc', 'note3'));

    await waitFor(() => {
      expect(document.title).toBe('Current Note · routeDoc · RemDo');
    });
  });

  it('resets the page title when the route unmounts', async () => {
    const { result } = renderDocumentRouteWithResult();

    await waitFor(() => {
      expect(document.title).toBe('routeDoc · RemDo');
    });
    result.unmount();

    expect(document.title).toBe('RemDo');
  });

  it('remounts editor when document id changes via route params', async () => {
    const router = renderDocumentRoute();

    const first = await screen.findByTestId('editor-probe');
    const firstInstanceId = first.dataset.instanceId;
    expect(first.dataset.docId).toBe('routeDoc');

    await router.navigate(createDocumentPath('other'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe').dataset.docId).toBe('other');
    });

    const second = screen.getByTestId('editor-probe');
    expect(second.dataset.instanceId).not.toBe(firstInstanceId);
  });
});
