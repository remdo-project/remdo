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
import type { HomeDocumentEntry, HomeDocumentSource } from './HomeView';
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
  onSelectDocument,
}: {
  docId: string;
  onSelectDocument: (docId: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const [homeActive, setHomeActive] = useState(false);
  const zoomPath = useZoomPath();
  const { requestZoomNoteId } = useEditorViewActions();
  const userData = useUserData();
  const documentSources = userData.documentSources().children();
  const source = useDocumentSourceResolution(docId, documentSources);
  const actions = useDocumentActions({ docId, onSelectDocument, userData });

  const homeSources: HomeDocumentSource[] = documentSources.map((documentSource) => ({
    id: documentSource.id(),
    label: documentSource.text(),
    documents: documentSource.documents().children().map((document) => ({
      id: document.id(),
      label: document.text(),
    })),
  }));
  const openDocumentFromHome = (nextDocId: string) => {
    setHomeActive(false);
    onSelectDocument(nextDocId);
  };
  // Placeholder entry-point groups. Favorites/Recents mirror real documents so
  // the layout reads correctly; Tags stays empty to exercise the hide-when-empty
  // rule. Replaced by real favoriting/tagging/visit-history sources later
  // (docs/todo.md → Home view follow-ups).
  const allHomeDocuments = homeSources.flatMap((homeSource) => homeSource.documents);
  const homeFavorites: HomeDocumentEntry[] = allHomeDocuments.slice(0, 2);
  const homeRecents: HomeDocumentEntry[] = allHomeDocuments.slice(0, 3);
  const homeTags: HomeDocumentEntry[] = [];
  const documentLabel = formatNavigationLabel(source.documentLabel);
  const titleItem = zoomPath.at(-1) ?? null;
  const pageTitle = titleItem
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
    setZoomNoteId: requestZoomNoteId,
  });

  useEffect(() => {
    document.title = pageTitle;
    return () => {
      document.title = APP_TITLE;
    };
  }, [pageTitle]);

  return (
    <div className="document-editor-shell" ref={shellRef}>
      <DocumentToolbar
        currentSourceId={source.currentSourceId}
        docId={docId}
        documentLabel={source.documentLabel}
        documentSources={documentSources}
        onCreateDocument={() => {
          void actions.createDocument();
        }}
        onSelectDocument={onSelectDocument}
        onSelectHome={() => setHomeActive(true)}
        onSelectNoteId={requestZoomNoteId}
        onStatusHostChange={setStatusHost}
        onUploadDocument={(file) => {
          void actions.uploadDocument(file);
        }}
        path={zoomPath}
        searchControl={<DocumentSearchInput model={search} />}
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
      {homeActive && (
        <HomeView
          favorites={homeFavorites}
          onCreateDocument={() => {
            setHomeActive(false);
            void actions.createDocument();
          }}
          onSelectDocument={openDocumentFromHome}
          onUploadDocument={(file) => {
            setHomeActive(false);
            void actions.uploadDocument(file);
          }}
          recents={homeRecents}
          sources={homeSources}
          tags={homeTags}
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
