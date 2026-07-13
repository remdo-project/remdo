import { Alert } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserData } from '#client/app/documents/user-data';
import {
  useDocumentSearchModel,
} from '#client/app/routes/useDocumentSearchModel';
import {
  useEditorViewActions,
  useZoomPath,
} from '#client/editor/view/EditorViewProvider';
import Editor from '#client/editor/Editor';
import { APP_TITLE, formatNavigationLabel } from '#client/ui/navigation-label';
import { DocumentSearchInput, DocumentSearchResults } from './DocumentSearch';
import DocumentToolbar from './DocumentToolbar';
import { HomeView } from './HomeView';
import { buildHomeContent } from './home-content';
import { useDocumentActions } from './useDocumentActions';
import { useDocumentSourceResolution } from './useDocumentSourceResolution';
import '../DocumentRoute.css';

function isVisibleInCurrentView(element: HTMLElement): boolean {
  if (element.classList.contains('zoom-hidden')) {
    return false;
  }
  let current: HTMLElement | null = element;
  while (current) {
    const style = globalThis.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

export default function DocumentWorkspace({
  docId,
  zoomNoteId,
  onSelectDocument,
}: {
  docId: string;
  zoomNoteId: string | null;
  onSelectDocument: (docId: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const [homeActive, setHomeActive] = useState(false);
  // The route can change under Home — a different document or a different zoom
  // target within the same document (history back/forward, a shared link). Reset
  // Home on any route change so it never covers the location the URL points at.
  const routeKey = zoomNoteId === null ? docId : `${docId}/${zoomNoteId}`;
  const previousRouteKeyRef = useRef(routeKey);
  if (previousRouteKeyRef.current !== routeKey) {
    previousRouteKeyRef.current = routeKey;
    if (homeActive) {
      setHomeActive(false);
    }
  }
  const zoomPath = useZoomPath();
  const { requestZoomNoteId } = useEditorViewActions();
  const userData = useUserData();
  const documentSources = userData.documentSources().children();
  const source = useDocumentSourceResolution(docId, documentSources);
  const actions = useDocumentActions({ docId, onSelectDocument, userData });

  // Home is a temporary overlay; any navigation away from it (opening a
  // document, creating/uploading one, zooming, or opening search) must dismiss
  // it, or the overlay would keep covering the editor for the newly targeted
  // document. leaveHome wraps a navigating action with that dismissal.
  const leaveHome = <Args extends unknown[]>(action: (...args: Args) => void) =>
    (...args: Args) => {
      setHomeActive(false);
      action(...args);
    };
  // Selecting a document leaves Home immediately (a synchronous route change).
  const selectDocument = leaveHome(onSelectDocument);
  // Create/upload are async: Home is left when they succeed and navigate to the
  // new document (the route-change reset below), not eagerly — so a failure
  // keeps the user on Home where its error alert is shown, rather than dropping
  // them into the editor for the previously-open document.
  const createDocument = () => {
    void actions.createDocument();
  };
  const uploadDocument = (file: File) => {
    void actions.uploadDocument(file);
  };
  // Opening a document from Home lands on its document-root view. Selecting the
  // already-open document is a no-op route change, so clear zoom directly (only
  // when actually zoomed) to reach the root instead of returning to the previous
  // zoomed subtree.
  const openDocumentFromHome = leaveHome((nextDocId: string) => {
    if (nextDocId !== docId) {
      onSelectDocument(nextDocId);
    } else if (zoomNoteId !== null) {
      requestZoomNoteId(null);
    }
  });
  // Zooming to a note (from search accept or the toolbar) is a navigation away
  // from Home. Kept stable because the search model memoizes on this identity.
  const zoomToNote = useCallback((noteId: string | null) => {
    setHomeActive(false);
    requestZoomNoteId(noteId);
  }, [requestZoomNoteId]);

  const documentLabel = formatNavigationLabel(source.documentLabel);
  const titleItem = zoomPath.at(-1) ?? null;
  const pageTitle = homeActive
    ? `Home · ${APP_TITLE}`
    : titleItem
      ? `${formatNavigationLabel(titleItem.label)} · ${documentLabel} · ${APP_TITLE}`
      : `${documentLabel} · ${APP_TITLE}`;

  const focusEditorInput = useCallback(() => {
    const editorInput = shellRef.current?.querySelector<HTMLElement>('.editor-input') ?? null;
    if (!editorInput || !isVisibleInCurrentView(editorInput)) {
      return false;
    }
    editorInput.focus();
    return document.activeElement === editorInput;
  }, []);
  const search = useDocumentSearchModel({
    focusEditorInput,
    setZoomNoteId: zoomToNote,
  });

  useEffect(() => {
    document.title = pageTitle;
    return () => {
      document.title = APP_TITLE;
    };
  }, [pageTitle]);

  // Home props are built only while it is open, skipping the document-tree walk
  // on the editor's render hot path when it is closed. (Opening search dismisses
  // Home via the search control's focus handler, so the two never co-render.)
  const home = homeActive ? buildHomeContent(documentSources) : null;

  return (
    <div className="document-editor-shell" ref={shellRef}>
      <DocumentToolbar
        currentSourceId={source.currentSourceId}
        docId={docId}
        documentLabel={source.documentLabel}
        documentSources={documentSources}
        onCreateDocument={createDocument}
        onSelectDocument={selectDocument}
        onSelectHome={() => setHomeActive(true)}
        onSelectNoteId={zoomToNote}
        onStatusHostChange={setStatusHost}
        onUploadDocument={uploadDocument}
        path={zoomPath}
        searchControl={(
          // Entering search takes over the content region; dismiss Home so the
          // two never render at once and closing search returns to the document.
          <span onFocusCapture={() => setHomeActive(false)}>
            <DocumentSearchInput model={search} />
          </span>
        )}
      />
      {actions.createError && (
        <Alert
          closeButtonLabel="Dismiss"
          color="red"
          onClose={actions.dismissCreateError}
          title="Could not create document"
          withCloseButton
        >
          {actions.createError}
        </Alert>
      )}
      {actions.uploadError && (
        <Alert
          closeButtonLabel="Dismiss"
          color="red"
          onClose={actions.dismissUploadError}
          title="Could not upload document"
          withCloseButton
        >
          {actions.uploadError}
        </Alert>
      )}
      <DocumentSearchResults model={search} />
      {home && (
        <HomeView
          {...home}
          onCreateDocument={createDocument}
          onSelectDocument={openDocumentFromHome}
          onUploadDocument={uploadDocument}
        />
      )}
      <div className={homeActive || search.searchModeActive
        ? 'document-editor-pane document-editor-pane--hidden'
        : 'document-editor-pane'}>
        {source.pending ? (
          <section className="document-editor-loading" role="status">
            Loading document
          </section>
        ) : (
          <Editor
            key={`${source.sourceId ?? 'local'}:${docId}`}
            docId={docId}
            sourceOrigin={source.sourceOrigin}
            sourceId={source.sourceId}
            searchModeRequested={search.searchModeRequested}
            statusPortalRoot={statusHost}
            onPendingDocumentImportError={actions.handleImportError}
          />
        )}
      </div>
    </div>
  );
}
