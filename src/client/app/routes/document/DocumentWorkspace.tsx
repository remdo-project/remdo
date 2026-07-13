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
  // Navigating document actions, shared by the toolbar and Home so both leave
  // Home the same way.
  const selectDocument = leaveHome(onSelectDocument);
  const createDocument = leaveHome(() => {
    void actions.createDocument();
  });
  const uploadDocument = leaveHome((file: File) => {
    void actions.uploadDocument(file);
  });
  // Opening a document from Home lands on its document-root view. Selecting the
  // already-open document is a no-op route change, so clear zoom directly to
  // reach the root instead of returning to the previous zoomed subtree.
  const openDocumentFromHome = leaveHome((nextDocId: string) => {
    if (nextDocId === docId) {
      requestZoomNoteId(null);
    } else {
      onSelectDocument(nextDocId);
    }
  });

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
    // Accepting a search result zooms to a note, which is a navigation away from
    // Home, so leave Home rather than reappearing over the zoomed note.
    setZoomNoteId: leaveHome(requestZoomNoteId),
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
        onSelectNoteId={leaveHome(requestZoomNoteId)}
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
