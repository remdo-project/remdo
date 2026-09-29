import { Alert } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserData, useUserDataRuntime } from '#client/app/user-data/user-data';
import {
  useDocumentSearchModel,
} from '#client/app/workspace/useDocumentSearchModel';
import {
  useEditorViewActions,
  useOpenDocument,
  useZoomPath,
} from '#client/editor/view/EditorViewProvider';
import Editor from '#client/editor/shell/Editor';
import { APP_TITLE, formatNavigationLabel } from '#client/ui/navigation-label';
import { DocumentMenu } from './DocumentMenu';
import { DocumentSearchInput, DocumentSearchResults } from './DocumentSearch';
import DocumentToolbar from './DocumentToolbar';
import { resolveDocumentSource } from './resolveDocumentSource';
import { useDocumentDialogs } from './useDocumentDialogs';
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
  onSelectHome,
  onSelectDocument,
}: {
  docId: string;
  zoomNoteId: string | null;
  onSelectHome: () => void;
  onSelectDocument: (docId: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [menuTarget, setMenuTarget] = useState<'header' | 'note'>('header');
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const { requestZoomNoteId } = useEditorViewActions();
  const zoomPath = useZoomPath();
  const openDocumentView = useOpenDocument()?.view;
  const { documentDialog, openDelete, openRename, openShare } = useDocumentDialogs(headingRef, onSelectHome);
  const userData = useUserData();
  const { userId } = useUserDataRuntime();
  const documentSources = userData.getDocumentSources().getChildren();
  const source = resolveDocumentSource(docId, documentSources);
  const [importError, setImportError] = useState<{ docId: string; message: string } | null>(null);
  if (importError && importError.docId !== docId) {
    setImportError(null);
  }
  const handleImportError = useCallback((error: Error) => {
    setImportError({ docId, message: error.message });
  }, [docId]);
  const openDocument = (nextDocId: string) => {
    if (nextDocId !== docId) {
      onSelectDocument(nextDocId);
    } else if (zoomNoteId !== null) {
      requestZoomNoteId(null);
    }
  };

  const documentLabel = formatNavigationLabel(source.documentLabel);
  const documentNote = userData.getDocuments().getById(docId);
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
    <div
      className="document-editor-shell"
      data-menu-target={zoomNoteId === null ? menuTarget : 'note'}
      ref={shellRef}
    >
      <DocumentToolbar
        docId={docId}
        documentLabel={source.documentLabel}
        documentSources={documentSources}
        onSelectDocument={openDocument}
        onSelectHome={onSelectHome}
        onSelectNoteId={requestZoomNoteId}
        onStatusHostChange={setStatusHost}
        path={zoomPath}
        searchControl={<DocumentSearchInput model={search} />}
      />
      {zoomNoteId === null && (
        <div
          className="location-header"
          onFocus={() => { setMenuTarget('header'); }}
          onPointerEnter={() => { setMenuTarget('header'); }}
        >
          {documentNote && (
            <DocumentMenu
              label={documentLabel}
              note={documentNote}
              onDelete={openDelete}
              onRename={openRename}
              onShare={openShare}
              view={openDocumentView}
            />
          )}
          <h1 className="location-header-title" ref={headingRef} tabIndex={-1}>
            {formatNavigationLabel(source.documentLabel, Number.POSITIVE_INFINITY)}
          </h1>
        </div>
      )}
      {importError?.docId === docId && (
        <Alert closeButtonLabel="Dismiss" color="red" onClose={() => setImportError(null)} title="Could not upload document" withCloseButton>
          {importError.message}
        </Alert>
      )}
      <DocumentSearchResults model={search} />
      <div
        className={search.searchModeActive
          ? 'document-editor-pane document-editor-pane--hidden'
          : 'document-editor-pane'}
        onFocus={() => { setMenuTarget('note'); }}
        onKeyDown={() => { setMenuTarget('note'); }}
        onPointerMove={(event) => {
          if (event.target instanceof Element && event.target.closest('li.list-item')) setMenuTarget('note');
        }}
      >
        <Editor
          key={docId}
          docId={docId}
          accountId={userId}
          statusPortalRoot={statusHost}
          onSelectHome={onSelectHome}
          onPendingDocumentImportError={handleImportError}
        />
      </div>
      {documentDialog}
    </div>
  );
}
