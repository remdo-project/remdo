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
import type { DocumentSourceNote } from '#note-sdk';

interface HomeProps {
  sources: HomeDocumentSource[];
  favorites: HomeDocumentEntry[];
  recents: HomeDocumentEntry[];
  tags: HomeDocumentEntry[];
}

// Builds the Home view's props from the live document sources. Favorites and
// Recents are static placeholder slices of the real document list; Tags is left
// empty to exercise the hide-when-empty rule. Replaced by real
// favoriting/tagging/visit-history sources later (docs/outliner/home.md#future).
function buildHomeProps(documentSources: readonly DocumentSourceNote[]): HomeProps {
  const sources: HomeDocumentSource[] = documentSources.map((documentSource) => ({
    id: documentSource.id(),
    label: documentSource.text(),
    documents: documentSource.documents().children().map((document) => ({
      id: document.id(),
      label: document.text(),
    })),
  }));
  const allDocuments = sources.flatMap((source) => source.documents);
  return {
    sources,
    favorites: allDocuments.slice(0, 2),
    recents: allDocuments.slice(0, 3),
    tags: [],
  };
}

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

  // Home is a temporary overlay; any navigation away from it (opening a
  // document, creating/uploading one, zooming, or opening search) must dismiss
  // it, or the overlay would keep covering the editor for the newly targeted
  // document. leaveHome wraps a navigating action with that dismissal.
  const leaveHome = <Args extends unknown[]>(action: (...args: Args) => void) =>
    (...args: Args) => {
      setHomeActive(false);
      action(...args);
    };

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
    setZoomNoteId: requestZoomNoteId,
  });

  useEffect(() => {
    document.title = pageTitle;
    return () => {
      document.title = APP_TITLE;
    };
  }, [pageTitle]);

  // Home and search both take over the content region; search wins while active,
  // so Home is suppressed rather than rendered alongside search results. Its
  // props are built only while visible, skipping the document-tree walk on the
  // editor's render hot path.
  const homeVisible = homeActive && !search.searchModeActive;
  const home = homeVisible ? buildHomeProps(documentSources) : null;

  return (
    <div className="document-editor-shell" ref={shellRef}>
      <DocumentToolbar
        currentSourceId={source.currentSourceId}
        docId={docId}
        documentLabel={source.documentLabel}
        documentSources={documentSources}
        onCreateDocument={leaveHome(() => {
          void actions.createDocument();
        })}
        onSelectDocument={leaveHome(onSelectDocument)}
        onSelectHome={() => setHomeActive(true)}
        onSelectNoteId={leaveHome(requestZoomNoteId)}
        onStatusHostChange={setStatusHost}
        onUploadDocument={leaveHome((file: File) => {
          void actions.uploadDocument(file);
        })}
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
      {home && (
        <HomeView
          favorites={home.favorites}
          onCreateDocument={leaveHome(() => {
            void actions.createDocument();
          })}
          onSelectDocument={leaveHome(onSelectDocument)}
          onUploadDocument={leaveHome((file: File) => {
            void actions.uploadDocument(file);
          })}
          recents={home.recents}
          sources={home.sources}
          tags={home.tags}
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
