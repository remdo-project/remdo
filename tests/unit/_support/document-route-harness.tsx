/* eslint-disable react-refresh/only-export-components -- Shared render harness for route component tests. */
import { MantineProvider } from '@mantine/core';
import { render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { resetTestUserData, TEST_USER_DATA_DOCUMENT } from '#tests';
import type {
  DocumentCapabilitiesSnapshot,
  DocumentSession,
  DocumentSnapshot,
  LoadState,
  NoteId,
  EditorNoteSnapshot,
  SnapshotStore,
} from '#note-sdk';
import type { NotePathItem } from '#client/editor/view/workspace';
import {
  useEditorViewActions,
  useRegisterDocumentSession,
  useZoomNoteId,
} from '#client/editor/view/EditorViewProvider';
import DocumentRoute from '#client/app/workspace/DocumentRoute';
import { createDocumentPath, parseDocumentRef } from '#document-routes';

vi.mock('#client/app/user-data/user-data', async () => {
  const { mockUserDataModule } = await import('#tests');
  return mockUserDataModule();
});

export function createNoteSnapshot(
  id: NoteId,
  text: string,
  fields: Partial<Pick<EditorNoteSnapshot, 'children' | 'checked'>> = {},
): EditorNoteSnapshot {
  return { id, text, checked: false, folded: false, children: null, ...fields };
}

export function createDocumentSnapshot(
  documentId: string,
  rootIds: readonly NoteId[],
  notes: readonly EditorNoteSnapshot[],
): DocumentSnapshot {
  return {
    documentId,
    root: { listType: 'bullet', noteIds: rootIds },
    notes: new Map(notes.map((note) => [note.id, note])),
  };
}

class TestSnapshotStore<T> implements SnapshotStore<T> {
  #snapshot: T;
  readonly #listeners = new Set<() => void>();

  constructor(snapshot: T) {
    this.#snapshot = snapshot;
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  publish(snapshot: T): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  get subscriberCount(): number {
    return this.#listeners.size;
  }
}

const LOADING_DOCUMENT: LoadState<DocumentSnapshot> = Object.freeze({ status: 'loading' });
const LOADING_CAPABILITIES: LoadState<DocumentCapabilitiesSnapshot> = Object.freeze({ status: 'loading' });

function defaultSnapshot(documentId: string): DocumentSnapshot {
  return createDocumentSnapshot(documentId, ['note1', 'note3', 'note5'], [
    createNoteSnapshot('note1', 'note1', { children: { listType: 'bullet', noteIds: ['note2'] } }),
    createNoteSnapshot('note2', 'note2'),
    createNoteSnapshot('note3', 'note3', { children: { listType: 'bullet', noteIds: ['note4'] } }),
    createNoteSnapshot('note4', 'note4'),
    createNoteSnapshot('note5', 'note5'),
  ]);
}

interface MockEditorProps {
  docId: string;
  sourceId?: string | null;
  sourceOrigin?: string | null;
}

let mockEditorInstanceCounter = 0;
let searchSnapshots: Record<string, DocumentSnapshot | null> = {};
let searchRefreshCallbacks: Record<string, () => void> = {};
let searchStores: Record<string, TestSnapshotStore<LoadState<DocumentSnapshot>>> = {};
let zoomPaths: Record<string, Record<string, NotePathItem[]>> = {};

function MockEditor({
  docId,
  sourceId = null,
  sourceOrigin = null,
}: MockEditorProps) {
  const zoomNoteId = useZoomNoteId();
  const { setZoomPath } = useEditorViewActions();
  const registerDocumentSession = useRegisterDocumentSession();
  const sessionState = React.useMemo(() => {
    const document = new TestSnapshotStore<LoadState<DocumentSnapshot>>(LOADING_DOCUMENT);
    const capabilities = new TestSnapshotStore<LoadState<DocumentCapabilitiesSnapshot>>(LOADING_CAPABILITIES);
    const noOp = () => {};
    const session: DocumentSession = {
      documentId: docId,
      document,
      capabilities,
      note: (noteId) => ({
        id: () => noteId,
        text: () => '',
        folded: () => false,
        toggleFold: () => Promise.resolve(),
        subscribe: () => noOp,
      }),
      focus: { toggleFold: noOp },
      selection: {
        indent: noOp,
        outdent: noOp,
        moveUp: noOp,
        moveDown: noOp,
        toggleChecked: noOp,
        delete: noOp,
      },
      history: { undo: noOp, redo: noOp },
    };
    return { document, session };
  }, [docId]);

  React.useEffect(() => {
    setZoomPath(zoomNoteId ? zoomPaths[docId]?.[zoomNoteId] ?? [] : []);
  }, [docId, setZoomPath, zoomNoteId]);

  React.useEffect(() => registerDocumentSession(sessionState.session), [registerDocumentSession, sessionState]);

  React.useEffect(() => {
    const applyCurrent = () => {
      const snapshot = searchSnapshots[docId];
      if (snapshot === null) {
        sessionState.document.publish(LOADING_DOCUMENT);
        return;
      }
      sessionState.document.publish({
        status: 'ready',
        data: snapshot ?? defaultSnapshot(docId),
      });
    };

    applyCurrent();
    searchStores[docId] = sessionState.document;
    searchRefreshCallbacks[docId] = applyCurrent;
    return () => {
      if (searchRefreshCallbacks[docId] === applyCurrent) {
        delete searchRefreshCallbacks[docId];
      }
      if (searchStores[docId] === sessionState.document) {
        delete searchStores[docId];
      }
    };
  }, [docId, sessionState]);

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

export function setMockSearchSnapshot(docId: string, snapshot: DocumentSnapshot | null) {
  searchSnapshots[docId] = snapshot;
}

export function refreshMockSearchNotes(docId: string) {
  searchRefreshCallbacks[docId]?.();
}

export function getMockSearchSubscriberCount(docId: string): number {
  return searchStores[docId]?.subscriberCount ?? 0;
}

export function setMockZoomPath(docId: string, noteId: string, path: NotePathItem[]) {
  (zoomPaths[docId] ??= {})[noteId] = path;
}

export function resetDocumentRouteHarness() {
  resetTestUserData();
  mockEditorInstanceCounter = 0;
  searchSnapshots = {};
  searchRefreshCallbacks = {};
  searchStores = {};
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
        loader: () => ({
          docId: TEST_USER_DATA_DOCUMENT.id,
          homeDocumentId: TEST_USER_DATA_DOCUMENT.id,
          noteId: null,
        }),
        element: routeElement,
        hydrateFallbackElement,
      },
      {
        path: '/n/:docRef',
        loader: ({ params }) => ({
          ...parseDocumentRef(params.docRef)!,
          homeDocumentId: TEST_USER_DATA_DOCUMENT.id,
        }),
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
  children: () => documents,
  byId: (documentId: string) => documents.find((document) => document.id === documentId) ?? null,
});
