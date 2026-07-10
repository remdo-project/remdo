/* eslint-disable react-refresh/only-export-components -- Shared render harness for route component tests. */
import { MantineProvider } from '@mantine/core';
import { render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { resetTestUserData } from '#tests';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import type { EditorNote, EditorNotes } from '#note-sdk';
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

export interface TestSearchSnapshot {
  allCandidates: TestSearchCandidate[];
  childCandidateMap: Record<string, TestSearchCandidate[]>;
}

function createTestEditorNotes(snapshot: TestSearchSnapshot): EditorNotes {
  const childMap = snapshot.childCandidateMap;
  const byId = new Map<string, TestSearchCandidate>();
  const parentOf = new Map<string, string | null>();
  for (const candidate of snapshot.allCandidates) {
    byId.set(candidate.noteId, candidate);
  }
  for (const [scopeId, children] of Object.entries(childMap)) {
    for (const child of children) {
      byId.set(child.noteId, child);
      parentOf.set(child.noteId, scopeId === ROOT_SEARCH_SCOPE_ID ? null : scopeId);
    }
  }

  const makeNote = (noteId: string): EditorNote => {
    const candidate = byId.get(noteId);
    const note: EditorNote = {
      id: () => noteId,
      kind: () => 'editor-note',
      attached: () => byId.has(noteId),
      text: () => candidate?.text ?? '',
      listType: () => candidate?.listType ?? 'bullet',
      checked: () => candidate?.checked ?? false,
      parent: () => {
        const parentId = parentOf.get(noteId) ?? null;
        return parentId === null ? null : makeNote(parentId);
      },
      children: () => (childMap[noteId] ?? []).map((child) => makeNote(child.noteId)),
      create: () => { throw new Error('create() is not used in document route tests.'); },
      body: () => null,
      as: ((kind: string) => {
        if (kind !== 'editor-note') {
          throw new Error(`mock note is editor-note, not ${kind}`);
        }
        return note;
      }) as EditorNote['as'],
    };
    return note;
  };

  const roots = (childMap[ROOT_SEARCH_SCOPE_ID] ?? []).map((child) => makeNote(child.noteId));
  return {
    currentDocument: () => ({ children: () => roots }),
    note: (noteId: string) => makeNote(noteId),
  } as unknown as EditorNotes;
}

export interface MockSearchGlobals {
  __remdoMockSearchNotesRefresh?: Record<string, () => void>;
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
  searchModeRequested?: boolean;
  sourceId?: string | null;
  sourceOrigin?: string | null;
}

let mockEditorInstanceCounter = 0;

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
    const globals = getMockSearchGlobals();
    setZoomPath(zoomNoteId ? globals.__remdoMockZoomPathByDoc?.[docId]?.[zoomNoteId] ?? [] : []);
  }, [docId, setZoomPath, zoomNoteId]);

  React.useEffect(() => {
    if (!searchModeRequested) {
      return;
    }
    const globals = getMockSearchGlobals();
    const applyCurrent = () => {
      const candidateSelection = globals.__remdoMockSearchCandidatesByDoc?.[docId];
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
    (globals.__remdoMockSearchNotesRefresh ??= {})[docId] = applyCurrent;
    return () => {
      if (globals.__remdoMockSearchNotesRefresh?.[docId] === applyCurrent) {
        delete globals.__remdoMockSearchNotesRefresh[docId];
      }
      registerSearchNotesReader(null);
    };
  }, [docId, registerSearchNotesReader, searchModeRequested]);

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
vi.mock('#client/editor/features/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: MockZoomBreadcrumbs,
}));

export function getMockSearchGlobals(): typeof globalThis & MockSearchGlobals {
  return globalThis;
}

export function resetDocumentRouteHarness() {
  resetTestUserData();
  mockEditorInstanceCounter = 0;
  const globals = getMockSearchGlobals();
  globals.__remdoMockSearchCandidatesByDoc = undefined;
  globals.__remdoMockSearchNotesRefresh = undefined;
  globals.__remdoMockZoomPathByDoc = undefined;
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
