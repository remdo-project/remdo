import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTestUserData,
  resetTestUserData,
  setTestDocumentSources,
  setTestDocumentSourcesLoading,
} from '#tests';

import { ROOT_SEARCH_SCOPE_ID } from '#client/editor/search/search-candidates';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import { useEditorViewActions, useZoomNoteId } from '#client/editor/view/EditorViewProvider';
import DocumentRoute from '#client/app/routes/DocumentRoute';
import * as pendingDocumentImports from '#client/editor/runtime/pending-document-import';
import { createDocumentPath, createDocumentSyncTokenApiPath, parseDocumentRef } from '#document-routes';

vi.mock('#client/app/documents/user-data', async () => {
  const { mockUserDataModule } = await import('#tests');
  return mockUserDataModule();
});

interface TestSearchCandidate {
  noteId: string;
  text: string;
  listType?: 'bullet' | 'number' | 'check';
  checked?: boolean;
}

interface TestSearchSnapshot {
  allCandidates: TestSearchCandidate[];
  childCandidateMap: Record<string, TestSearchCandidate[]>;
  ancestorPathMap?: Record<string, NotePathItem[]>;
}

// Mirrors the real SearchCandidatesPlugin: derive each note's root-to-note
// ancestor path from the child map so existing inline snapshots stay valid.
function deriveAncestorPathMap(
  childCandidateMap: TestSearchSnapshot['childCandidateMap']
): Record<string, NotePathItem[]> {
  const ancestorPathMap: Record<string, NotePathItem[]> = {};
  const roots = childCandidateMap[ROOT_SEARCH_SCOPE_ID] ?? [];
  const stack: Array<{ noteId: string; text: string; ancestors: NotePathItem[] }> = roots
    .map((note) => ({ ...note, ancestors: [] }));

  while (stack.length > 0) {
    const { noteId, text, ancestors } = stack.pop()!;
    const path = [...ancestors, { noteId, label: text }];
    ancestorPathMap[noteId] = path;
    for (const child of childCandidateMap[noteId] ?? []) {
      stack.push({ ...child, ancestors: path });
    }
  }

  return ancestorPathMap;
}

interface MockSearchGlobals {
  __remdoMockSearchCandidateEmitters?: Record<string, () => void>;
  __remdoMockSearchCandidateResetters?: Record<string, () => void>;
  __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
  __remdoMockZoomPathByDoc?: Record<string, Record<string, NotePathItem[]>>;
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

interface MockEditorProps {
  docId: string;
  onSearchCandidatesChange?: (snapshot: TestSearchSnapshot | null) => void;
  searchModeRequested?: boolean;
  sourceId?: string | null;
  sourceOrigin?: string | null;
}

let mockEditorInstanceCounter = 0;

function MockEditor({
  docId,
  onSearchCandidatesChange,
  searchModeRequested,
  sourceId = null,
  sourceOrigin = null,
}: MockEditorProps) {
  const zoomNoteId = useZoomNoteId();
  const { setZoomPath } = useEditorViewActions();

  React.useEffect(() => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    setZoomPath(zoomNoteId ? globals.__remdoMockZoomPathByDoc?.[docId]?.[zoomNoteId] ?? [] : []);
  }, [docId, setZoomPath, zoomNoteId]);

  React.useEffect(() => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    const emitCurrentSnapshot = () => {
      const candidateSelection = globals.__remdoMockSearchCandidatesByDoc?.[docId];
      if (candidateSelection === null) {
        return;
      }
      const sdkSnapshot: TestSearchSnapshot = candidateSelection ?? defaultSnapshot;
      onSearchCandidatesChange?.({
        ...sdkSnapshot,
        ancestorPathMap: sdkSnapshot.ancestorPathMap ?? deriveAncestorPathMap(sdkSnapshot.childCandidateMap),
      });
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
        data-source-id={sourceId ?? ''}
        data-source-origin={sourceOrigin ?? ''}
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

function MockZoomBreadcrumbs({ documentControl }: { documentControl: React.ReactNode }) {
  return <>{documentControl}</>;
}

vi.mock('#client/editor/Editor', () => ({ default: MockEditor }));

vi.mock('#client/editor/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: MockZoomBreadcrumbs,
}));

describe('document route', () => {
  beforeEach(() => {
    resetTestUserData();
    mockEditorInstanceCounter = 0;
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = undefined;
    globals.__remdoMockSearchCandidateEmitters = undefined;
    globals.__remdoMockSearchCandidateResetters = undefined;
    globals.__remdoMockZoomPathByDoc = undefined;
    document.title = 'RemDo';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderDocumentRouteWithResult = (initialEntry: string = createDocumentPath('routeDoc')) => {
    const router = createMemoryRouter(
      [{
        path: '/n/:docRef',
        loader: ({ params }) => parseDocumentRef(params.docRef)!,
        element: <DocumentRoute />,
        hydrateFallbackElement: <div aria-hidden="true" />,
      }],
      { initialEntries: [initialEntry] },
    );

    const result = render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    );

    return { router, result };
  };
  const renderDocumentRoute = (initialEntry: string = createDocumentPath('routeDoc')) =>
    renderDocumentRouteWithResult(initialEntry).router;

  const getActiveSearchResult = () =>
    document.querySelector<HTMLElement>('[data-search-result-item][data-search-result-active="true"]');
  const getActiveResultLabel = () =>
    getActiveSearchResult()?.getAttribute('data-search-result-label') ?? null;
  const getResultLabels = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-search-result-item]'),
      (item) => item.getAttribute('data-search-result-label')
    );
  const getInlineCompletion = () =>
    document.querySelector<HTMLElement>('[data-testid="document-search-inline-completion"]');

  const createDocumentCollectionSource = (documents: Array<{ id: string; title: string }>) => ({
    children: () => documents,
    byId: (documentId: string) => documents.find((document) => document.id === documentId) ?? null,
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

  const clickNewDocument = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));
    fireEvent.click(await screen.findByRole('option', { hidden: true, name: 'New' }));
  };

  const clickUploadDocument = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));
    fireEvent.click(await screen.findByText('Upload'));
  };

  it('shows the upload action directly below the new document action', async () => {
    renderDocumentRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));

    const newOption = await screen.findByRole('option', { hidden: true, name: 'New' });
    const uploadOption = (await screen.findByText('Upload')).closest('[role="option"]');
    expect(uploadOption).not.toBeNull();
    expect(newOption.compareDocumentPosition(uploadOption!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('creates a document from the selected backup filename before registering the pending import', async () => {
    const registerPendingImport = vi.spyOn(pendingDocumentImports, 'registerPendingDocumentImport');
    const router = renderDocumentRoute();
    await clickUploadDocument();

    const file = new File(['{"root":{"type":"root","children":[]}}'], ' Project Backup.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText('Upload document backup'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(registerPendingImport).toHaveBeenCalledTimes(1);
    });

    const [createdDocId, registeredFile] = registerPendingImport.mock.calls[0]!;
    expect(registeredFile).toBe(file);
    expect(getTestUserData().documents().byId(createdDocId)?.text()).toBe('Project Backup');
    expect(router.state.location.pathname).toBe(createDocumentPath(createdDocId));
  });

  it('does not register a pending import when upload document creation fails', async () => {
    const registerPendingImport = vi.spyOn(pendingDocumentImports, 'registerPendingDocumentImport');
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    renderDocumentRoute();
    await clickUploadDocument();
    fireEvent.change(screen.getByLabelText('Upload document backup'), {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create document');
    expect(alert).toHaveTextContent('offline');
    expect(registerPendingImport).not.toHaveBeenCalled();
  });

  it('surfaces an alert when creating a new document fails', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    renderDocumentRoute();
    await clickNewDocument();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create document');
    expect(alert).toHaveTextContent('offline');
  });

  it('dismisses the creation error alert via its close button', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    renderDocumentRoute();
    await clickNewDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('clears the creation error when navigating to another document', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    const router = renderDocumentRoute(createDocumentPath('routeDoc'));
    await clickNewDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await router.navigate(createDocumentPath('other'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe').dataset.docId).toBe('other');
      expect(screen.queryByRole('alert')).toBeNull();
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
    fireEvent.click(result);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'note3'));
      expect(screen.queryByTestId('document-search-results')).toBeNull();
    });
  });

  describe('result row context', () => {
    const setSnapshot = (snapshot: TestSearchSnapshot) => {
      (globalThis as typeof globalThis & MockSearchGlobals).__remdoMockSearchCandidatesByDoc = {
        routeDoc: snapshot,
      };
    };

    const contextSnapshot: TestSearchSnapshot = {
      allCandidates: [
        { noteId: 'root', text: 'Work' },
        { noteId: 'mid', text: 'Q3 planning' },
        { noteId: 'mid2', text: 'Roadmap' },
        { noteId: 'mid3', text: 'Grooming' },
        { noteId: 'parent', text: 'Sprint backlog' },
        { noteId: 'match', text: 'TODO refine estimates' },
        { noteId: 'c1', text: 'sub one', listType: 'number' },
        { noteId: 'c2', text: 'sub two', listType: 'check', checked: true },
        { noteId: 'c3', text: 'sub three' },
      ],
      childCandidateMap: {
        [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'root', text: 'Work' }],
        root: [{ noteId: 'mid', text: 'Q3 planning' }],
        mid: [{ noteId: 'mid2', text: 'Roadmap' }],
        mid2: [{ noteId: 'mid3', text: 'Grooming' }],
        mid3: [{ noteId: 'parent', text: 'Sprint backlog' }],
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

    it('gives every result the same breadcrumb layout regardless of highlight', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'sub' } });

      // 'sub two' is not the highlighted row, yet it still renders the breadcrumb
      // (ending in its own text) — so moving the highlight never re-lays-out rows.
      const subTwo = await screen.findByRole('option', { name: 'sub two' });
      expect(subTwo.getAttribute('data-search-result-active')).toBeNull();
      const matchCrumb = subTwo.querySelector('[data-search-result-match-crumb]');
      expect(matchCrumb?.textContent).toBe('sub two');
      expect(subTwo.querySelector('.document-search-result-breadcrumb')).not.toBeNull();
    });

    it('marks the matched note crumb checked when the result is a checked note', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'sub' } });

      // 'sub two' is a checked check-list note → its match crumb is struck through.
      const subTwo = await screen.findByRole('option', { name: 'sub two' });
      const matchCrumb = subTwo.querySelector('[data-search-result-match-crumb]');
      expect(matchCrumb?.getAttribute('data-note-checked')).toBe('true');
      expect(matchCrumb?.classList.contains('document-search-result-crumb--checked')).toBe(true);
    });

    it('strikes through the match crumb when the matched note is checked', async () => {
      setSnapshot({
        allCandidates: [{ noteId: 'done', text: 'wrap up review', checked: true }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'done', text: 'wrap up review', checked: true }],
          done: [],
        },
      });
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'wrap' } });

      const active = await screen.findByRole('option', { name: 'wrap up review' });
      const matchCrumb = active.querySelector('[data-search-result-match-crumb]');
      expect(matchCrumb?.getAttribute('data-note-checked')).toBe('true');
      expect(matchCrumb?.classList.contains('document-search-result-crumb--checked')).toBe(true);
    });

    it('expands the highlighted row with a truncating breadcrumb and child preview', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await screen.findByRole('option', { name: 'TODO refine estimates' });
      // Root crumb (Work) is omitted, leaving Q3 / Roadmap / Grooming / Sprint /
      // match (5) → collapses to first-2 + ⋯ + last-2.
      const crumbs = active.querySelectorAll('.document-search-result-crumb');
      const crumbText = Array.from(crumbs, (crumb) => crumb.textContent);
      expect(crumbText).toContain('⋯');
      expect(crumbText.at(0)).toBe('Q3 planning');
      expect(crumbText.at(-1)).toContain('TODO refine estimates');

      const ellipsis = active.querySelector('.document-search-result-crumb--ellipsis');
      expect(ellipsis?.getAttribute('title')).toBe('Grooming');

      const childTexts = Array.from(
        active.querySelectorAll('.document-search-result-children .list-item'),
        (child) => child.textContent
      );
      expect(childTexts).toEqual(['sub one', 'sub two']);
      expect(active.querySelector('.document-search-result-children-more')?.textContent)
        .toBe('+1 more');
    });

    it('omits the root crumb and separates crumbs with a slash', async () => {
      setSnapshot(contextSnapshot);
      renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await screen.findByRole('option', { name: 'TODO refine estimates' });
      // 'Work' (root) is dropped; the first shown crumb is the second level.
      const ancestorLabels = Array.from(
        active.querySelectorAll('[data-search-result-ancestor-crumb]'),
        (crumb) => crumb.textContent
      );
      expect(ancestorLabels).not.toContain('Work');
      expect(ancestorLabels[0]).toBe('Q3 planning');

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

      const active = await screen.findByRole('option', { name: 'TODO refine estimates' });
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

      const subTwo = await screen.findByRole('option', { name: 'sub two' });
      const mark = subTwo.querySelector('.document-search-result-mark');
      expect(mark?.textContent).toBe('sub');
    });

    it('highlights a match past the navigation label length cap on the expanded row', async () => {
      const longText = `${'x'.repeat(60)} needle tail`;
      setSnapshot({
        allCandidates: [{ noteId: 'long', text: longText }],
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

    it('zooms to an ancestor crumb and closes search when clicked', async () => {
      setSnapshot(contextSnapshot);
      const router = renderDocumentRoute();

      const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'refine' } });

      const active = await screen.findByRole('option', { name: 'TODO refine estimates' });
      const ancestorCrumb = Array.from(
        active.querySelectorAll<HTMLElement>('[data-search-result-ancestor-crumb]')
      ).find((crumb) => crumb.textContent === 'Q3 planning');
      expect(ancestorCrumb).toBeDefined();

      fireEvent.pointerDown(ancestorCrumb!);
      fireEvent.click(ancestorCrumb!);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'mid'));
        expect(screen.queryByTestId('document-search-results')).toBeNull();
      });
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

    const resultItems = getResultLabels();
    expect(resultItems).toEqual(['note1', 'note3', 'note5']);
    expect(getActiveResultLabel()).toBe('note1');
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
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
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
      expect(getActiveResultLabel()).toBe('note1');
    });

    const resultItems = getResultLabels();
    expect(resultItems).toEqual(['note1']);
  });

  it('slash arrow cycling changes highlight without mutating query', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note3');
    expect(searchInput).toHaveValue('/');
    expect(getResultLabels())
      .toEqual(['note1', 'note3', 'note5']);

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note5');
    expect(searchInput).toHaveValue('/');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(getActiveResultLabel()).toBe('note3');
    expect(searchInput).toHaveValue('/');
  });

  it('descends slash scope to highlighted note children after appending "/"', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note3');
    expect(searchInput).toHaveValue('/');

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });

    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note4']);
      expect(getActiveResultLabel()).toBe('note4');
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
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.change(searchInput, { target: { value: '/note3/' } });

    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note4']);
      expect(getActiveResultLabel()).toBe('note4');
      expect(searchInput).toHaveValue('/note3/');
    });
  });

  it('replaces an existing descended slash path from the new query segment', async () => {
    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/note1/' } });

    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note2']);
      expect(getActiveResultLabel()).toBe('note2');
    });

    fireEvent.change(searchInput, { target: { value: '/note3/' } });

    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note4']);
      expect(getActiveResultLabel()).toBe('note4');
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
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note2']);
      expect(getActiveResultLabel()).toBe('note2');
    });

    fireEvent.change(searchInput, { target: { value: '/note3/no' } });

    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note4']);
      expect(getActiveResultLabel()).toBe('note4');
      expect(searchInput).toHaveValue('/note3/no');
    });
  });

  it('supports deeper slash scope descent without query auto-write', async () => {
    (
      globalThis as typeof globalThis & {
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('/');

    fireEvent.change(searchInput, { target: { value: '//' } });
    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note4');
    });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput).toHaveValue('//');

    fireEvent.change(searchInput, { target: { value: '///' } });
    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note6');
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
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.change(searchInput, { target: { value: '//' } });
    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note2']);
      expect(getActiveResultLabel()).toBe('note2');
    });

    fireEvent.change(searchInput, { target: { value: '/' } });
    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note1', 'note3', 'note5']);
      expect(getActiveResultLabel()).toBe('note1');
    });
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
    (
      globalThis as typeof globalThis & {
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
    (
      globalThis as typeof globalThis & {
        __remdoMockSearchCandidatesByDoc?: Record<string, TestSearchSnapshot | null>;
      }
    ).__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      routeDoc: null,
    };

    renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'fresh' } });

    globals.__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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

    globals.__remdoMockSearchCandidateEmitters?.routeDoc?.();

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('fresh result');
    });
  });

  it('waits for a fresh snapshot after invalidating current document candidates', async () => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
      expect(getActiveResultLabel()).toBe('shared result');
    });

    globals.__remdoMockSearchCandidateResetters?.routeDoc?.();

    await waitFor(() => {
      expect(screen.queryByTestId('document-search-results')).toBeNull();
      expect(screen.queryByText('No matches')).toBeNull();
      expect(screen.queryByText('No notes')).toBeNull();
    });

    globals.__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
        allCandidates: [{ noteId: 'fresh', text: 'fresh result' }],
        childCandidateMap: {
          [ROOT_SEARCH_SCOPE_ID]: [{ noteId: 'fresh', text: 'fresh result' }],
          fresh: [],
        },
      },
    };
    globals.__remdoMockSearchCandidateEmitters?.routeDoc?.();

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('fresh result');
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
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.change(searchInput, { target: { value: '//' } });
    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note2']);
      expect(searchInput).toHaveValue('//');
    });

    await router.navigate(createDocumentPath('other'));

    const otherSearchInput = await screen.findByRole('combobox', { name: 'Search document' });
    otherSearchInput.focus();

    await waitFor(() => {
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['other2']);
      expect(getActiveResultLabel()).toBe('other2');
      expect(otherSearchInput).toHaveValue('//');
    });
  });

  it('re-resolves completed slash queries when switching documents', async () => {
    (
      globalThis as typeof globalThis & MockSearchGlobals
    ).__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note7']);
      expect(getActiveResultLabel()).toBe('note7');
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
      routeDoc: {
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
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['note2']);
      expect(getActiveResultLabel()).toBe('note2');
    });

    globals.__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
    globals.__remdoMockSearchCandidateEmitters?.routeDoc?.();

    await screen.findByText('No matches');
    expect(document.querySelectorAll('[data-search-result-item]')).toHaveLength(0);
    expect(searchInput).toHaveValue('/note1/');

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
  });

  it('matches completed slash segments exactly instead of by substring', async () => {
    const globals = globalThis as typeof globalThis & MockSearchGlobals;
    globals.__remdoMockSearchCandidatesByDoc = {
      routeDoc: {
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
      const resultItems = getResultLabels();
      expect(resultItems).toEqual(['foo child']);
      expect(getActiveResultLabel()).toBe('foo child');
    });
  });

  it('zooms to document root on Enter when query is exactly "/"', async () => {
    const router = renderDocumentRoute(createDocumentPath('routeDoc', 'note3'));

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });
    await screen.findByTestId('document-search-results');

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc'));
    });
    expect(document.activeElement).toHaveClass('editor-input');
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

  it('zooms to highlighted slash descendant on Enter', async () => {
    const router = renderDocumentRoute();

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: '/' } });

    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note1');
    });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(getActiveResultLabel()).toBe('note3');

    fireEvent.change(searchInput, { target: { value: `${(searchInput as HTMLInputElement).value}/` } });
    await waitFor(() => {
      expect(getActiveResultLabel()).toBe('note4');
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('routeDoc', 'note4'));
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
