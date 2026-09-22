/* eslint-disable react-refresh/only-export-components -- Shared render harness for route component tests. */
import { MantineProvider } from '@mantine/core';
import { render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { resetTestUserData } from '#tests';
import type {
  DocumentSession,
  NoteId,
  EditorNoteSnapshot,
  SearchResult,
} from '#note-sdk';
import type { NotePathItem } from '#client/editor/view/workspace';
import {
  useEditorViewActions,
  useRegisterDocumentSession,
  useZoomNoteId,
} from '#client/editor/view/EditorViewProvider';
import DocumentRoute from '#client/app/workspace/DocumentRoute';
import Home from '#client/app/workspace/Home';
import { createDocumentPath, parseDocumentRef } from '#document-routes';

vi.mock('#client/app/user-data/user-data', async () => {
  const { mockUserDataModule } = await import('#tests');
  return mockUserDataModule();
});

export function createSearchResult(
  id: NoteId,
  text: string,
  fields: Partial<Pick<SearchResult, 'path' | 'childPreview'>> = {},
): SearchResult {
  const note: EditorNoteSnapshot = { id, text, body: null, checked: false, folded: false, children: null };
  return {
    note,
    path: [note],
    childPreview: { notes: [], listType: 'bullet', totalCount: 0 },
    ...fields,
  };
}

function defaultResults(): SearchResult[] {
  const second = createSearchResult('note2', 'note2');
  const fourth = createSearchResult('note4', 'note4');
  return [
    createSearchResult('note1', 'note1', {
      childPreview: { notes: [second.note], listType: 'bullet', totalCount: 1 },
    }),
    second,
    createSearchResult('note3', 'note3', {
      childPreview: { notes: [fourth.note], listType: 'bullet', totalCount: 1 },
    }),
    fourth,
    createSearchResult('note5', 'note5'),
  ];
}

interface MockEditorProps {
  docId: string;
  sourceId?: string | null;
  sourceOrigin?: string | null;
}

let mockEditorInstanceCounter = 0;
let documentSearches: Record<string, Mock<DocumentSession['search']>> = {};
let documentAvailability: Record<string, boolean> = {};
let availabilityCallbacks: Record<string, () => void> = {};
let zoomPaths: Record<string, Record<string, NotePathItem[]>> = {};

function MockEditor({
  docId,
  sourceId = null,
  sourceOrigin = null,
}: MockEditorProps) {
  const zoomNoteId = useZoomNoteId();
  const { setZoomPath } = useEditorViewActions();
  const registerDocumentSession = useRegisterDocumentSession();
  const [, refreshAvailability] = React.useReducer((value: number) => value + 1, 0);
  const available = documentAvailability[docId] ?? true;
  const session = React.useMemo<DocumentSession>(() => {
    const noOp = () => {};
    return {
      documentId: docId,
      search: mockDocumentSearch(docId),
      subscribeCapabilities: () => noOp,
      noteRef: (noteId) => ({
        getId: () => noteId,
        getText: () => '',
        getFolded: () => false,
        getChecked: () => false,
        getChildListType: () => null,
        canToggleFold: () => false,
        canToggleChecked: () => true,
        canSetChildListType: () => false,
        toggleChecked: () => Promise.resolve(),
        setChildListType: () => Promise.resolve(),
        zoom: noOp,
        toggleFold: () => Promise.resolve(),
        subscribe: () => noOp,
      }),
      view: { zoomOut: noOp, foldToLevel: noOp },
      focus: { canToggleFold: () => false, toggleFold: noOp },
      selection: {
        canDelete: () => false,
        indent: noOp,
        outdent: noOp,
        moveUp: noOp,
        moveDown: noOp,
        toggleChecked: noOp,
        delete: noOp,
      },
      history: { canUndo: () => false, canRedo: () => false, undo: noOp, redo: noOp },
    };
  }, [docId]);

  React.useEffect(() => {
    setZoomPath(zoomNoteId ? zoomPaths[docId]?.[zoomNoteId] ?? [] : []);
  }, [docId, setZoomPath, zoomNoteId]);

  React.useEffect(() => {
    if (available) {
      return registerDocumentSession(session);
    }
  }, [available, registerDocumentSession, session]);

  React.useEffect(() => {
    availabilityCallbacks[docId] = refreshAvailability;
    return () => {
      if (availabilityCallbacks[docId] === refreshAvailability) {
        delete availabilityCallbacks[docId];
      }
    };
  }, [docId]);

  const [instanceId] = React.useState(() => `instance-${++mockEditorInstanceCounter}`);
  return (
    <>
      <div
        data-doc-id={docId}
        data-instance-id={instanceId}
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

function MockZoomBreadcrumbs({
  documentControl,
  onSelectHome,
  onSelectNoteId,
}: {
  documentControl: React.ReactNode;
  onSelectHome?: () => void;
  onSelectNoteId: (noteId: string | null) => void;
}) {
  return (
    <>
      {onSelectHome ? <button onClick={onSelectHome} type="button">Home</button> : null}
      {documentControl}
      <button onClick={() => onSelectNoteId('note3')} type="button">Zoom note</button>
      <button onClick={() => onSelectNoteId(null)} type="button">Clear zoom</button>
    </>
  );
}

vi.mock('#client/editor/shell/Editor', () => ({ default: MockEditor }));
vi.mock('#client/editor/features/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: MockZoomBreadcrumbs,
}));

export function mockDocumentSearch(docId: string): Mock<DocumentSession['search']> {
  return documentSearches[docId] ??= vi.fn<DocumentSession['search']>()
    .mockResolvedValue({ flatResults: defaultResults(), hasMore: false });
}

export function setMockDocumentAvailable(docId: string, available: boolean) {
  documentAvailability[docId] = available;
  availabilityCallbacks[docId]?.();
}

export function setMockZoomPath(docId: string, noteId: string, path: NotePathItem[]) {
  (zoomPaths[docId] ??= {})[noteId] = path;
}

export function resetDocumentRouteHarness() {
  resetTestUserData();
  mockEditorInstanceCounter = 0;
  documentSearches = {};
  documentAvailability = {};
  availabilityCallbacks = {};
  zoomPaths = {};
  document.title = 'RemDo';
}

export function renderDocumentRouteWithResult(initialEntry: string = createDocumentPath('routeDoc')) {
  const routeElement = <DocumentRoute />;
  const hydrateFallbackElement = <div aria-hidden="true" />;
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Home />,
        hydrateFallbackElement,
      },
      {
        path: '/n/:docRef',
        loader: ({ params }) => parseDocumentRef(params.docRef)!,
        element: routeElement,
        hydrateFallbackElement,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  const result = render(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>
  );

  return { router, result };
}

export const renderDocumentRoute = (initialEntry: string = createDocumentPath('routeDoc')) =>
  renderDocumentRouteWithResult(initialEntry).router;

export const getActiveSearchResult = () =>
  document.querySelector<HTMLElement>('[data-search-result-item][data-search-result-active="true"]');

export const getActiveResultLabel = () =>
  getActiveSearchResult()?.getAttribute('data-search-result-label') ?? null;

export const getResultLabels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[data-search-result-item]'),
    (item) => item.getAttribute('data-search-result-label')
  );

export function getResultByLabel(label: string) {
  const row = document.querySelector<HTMLElement>(
    `[data-search-result-item][data-search-result-label="${label}"]`
  );
  if (!row) {
    throw new Error(`No search result row with label "${label}"`);
  }
  return row;
}

export const findResultByLabel = (label: string) => waitFor(() => getResultByLabel(label));

export const createDocumentCollectionSource = (documents: Array<{ id: string; title: string }>) => ({
  getChildren: () => documents,
  getById: (documentId: string) => documents.find((document) => document.id === documentId) ?? null,
});
