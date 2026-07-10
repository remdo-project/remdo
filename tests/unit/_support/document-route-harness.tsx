/* eslint-disable react-refresh/only-export-components -- Shared render harness for route component tests. */
import { MantineProvider } from '@mantine/core';
import { render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { resetTestUserData } from '#tests';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import type {
  SearchableNote,
  SearchableNotes,
} from '#client/editor/search/search-candidates';
import {
  useEditorViewActions,
  useRegisterSearchNotesReader,
  useZoomNoteId,
} from '#client/editor/view/EditorViewProvider';
import type { SearchNotesReader } from '#client/editor/view/EditorViewProvider';
import DocumentRoute from '#client/app/routes/DocumentRoute';
import { createDocumentPath, parseDocumentRef } from '#document-routes';

vi.mock('#client/app/documents/user-data', async () => {
  const { mockUserDataModule } = await import('#tests');
  return mockUserDataModule();
});

export const ROOT_SEARCH_SCOPE_ID = '__document_root__';

export interface TestSearchCandidate {
  noteId: string;
  text: string;
  listType?: 'bullet' | 'number' | 'check';
  checked?: boolean;
}

export type TestSearchSnapshot = Record<string, TestSearchCandidate[]>;

function createTestEditorNotes(snapshot: TestSearchSnapshot): SearchableNotes {
  const childMap = snapshot;
  const makeNote = (candidate: TestSearchCandidate): SearchableNote => ({
    id: () => candidate.noteId,
    text: () => candidate.text,
    listType: () => candidate.listType ?? 'bullet',
    checked: () => candidate.checked ?? false,
    children: () => (childMap[candidate.noteId] ?? []).map(makeNote),
  });

  const roots = (childMap[ROOT_SEARCH_SCOPE_ID] ?? []).map(makeNote);
  return {
    currentDocument: () => ({ children: () => roots }),
  };
}

const defaultSnapshot = {
  [ROOT_SEARCH_SCOPE_ID]: [
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note3', text: 'note3' },
    { noteId: 'note5', text: 'note5' },
  ],
  note1: [{ noteId: 'note2', text: 'note2' }],
  note3: [{ noteId: 'note4', text: 'note4' }],
} satisfies TestSearchSnapshot;

interface MockEditorProps {
  docId: string;
  searchModeRequested?: boolean;
  sourceId?: string | null;
  sourceOrigin?: string | null;
}

let mockEditorInstanceCounter = 0;
let searchSnapshots: Record<string, TestSearchSnapshot | null> = {};
let searchRefreshCallbacks: Record<string, () => void> = {};
let zoomPaths: Record<string, Record<string, NotePathItem[]>> = {};

function MockEditor({
  docId,
  searchModeRequested,
  sourceId = null,
  sourceOrigin = null,
}: MockEditorProps) {
  const zoomNoteId = useZoomNoteId();
  const { setZoomPath } = useEditorViewActions();
  const registerSearchNotesReader = useRegisterSearchNotesReader();

  React.useEffect(() => {
    setZoomPath(zoomNoteId ? zoomPaths[docId]?.[zoomNoteId] ?? [] : []);
  }, [docId, setZoomPath, zoomNoteId]);

  React.useEffect(() => {
    if (!searchModeRequested) {
      return;
    }
    const applyCurrent = () => {
      const candidateSelection = searchSnapshots[docId];
      if (candidateSelection === null) {
        registerSearchNotesReader(null);
        return;
      }
      const snapshot = candidateSelection ?? defaultSnapshot;
      const notes = createTestEditorNotes(snapshot);
      const reader: SearchNotesReader = (fn) => fn(notes);
      registerSearchNotesReader(reader);
    };

    applyCurrent();
    searchRefreshCallbacks[docId] = applyCurrent;
    return () => {
      if (searchRefreshCallbacks[docId] === applyCurrent) {
        delete searchRefreshCallbacks[docId];
      }
      registerSearchNotesReader(null);
    };
  }, [docId, registerSearchNotesReader, searchModeRequested]);

  const [instanceId] = React.useState(() => `instance-${++mockEditorInstanceCounter}`);
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
vi.mock('#client/editor/features/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: MockZoomBreadcrumbs,
}));

export function setMockSearchSnapshot(docId: string, snapshot: TestSearchSnapshot | null) {
  searchSnapshots[docId] = snapshot;
}

export function refreshMockSearchNotes(docId: string) {
  searchRefreshCallbacks[docId]?.();
}

export function setMockZoomPath(docId: string, noteId: string, path: NotePathItem[]) {
  (zoomPaths[docId] ??= {})[noteId] = path;
}

export function resetDocumentRouteHarness() {
  resetTestUserData();
  mockEditorInstanceCounter = 0;
  searchSnapshots = {};
  searchRefreshCallbacks = {};
  zoomPaths = {};
  document.title = 'RemDo';
}

export function renderDocumentRouteWithResult(initialEntry: string = createDocumentPath('routeDoc')) {
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
