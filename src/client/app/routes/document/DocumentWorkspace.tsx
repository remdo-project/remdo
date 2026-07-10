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
  const zoomPath = useZoomPath();
  const { requestZoomNoteId } = useEditorViewActions();
  const userData = useUserData();
  const documentSources = userData.documentSources().children();
  const source = useDocumentSourceResolution(docId, documentSources);
  const actions = useDocumentActions({ docId, onSelectDocument, userData });
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
        currentSourceId={source.currentSource?.id() ?? null}
        docId={docId}
        documentLabel={source.documentLabel}
        documentSources={documentSources}
        onCreateDocument={() => {
          void actions.createDocument();
        }}
        onSelectDocument={onSelectDocument}
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
      <div className={search.searchModeActive
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
