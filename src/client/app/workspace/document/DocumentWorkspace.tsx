import { Alert } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { KeyboardReference } from '#client/editor/shell/KeyboardReference';
import { Button, Tooltip, TooltipTrigger } from 'react-aria-components';
import { IconShare } from '@tabler/icons-react';
import { Icon } from '#client/ui/Icon';
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
}: {
  docId: string;
  zoomNoteId: string | null;
  onSelectHome: () => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuTargetState, setMenuTargetState] = useState<{ docId: string; target: 'header' | 'note' }>({
    docId,
    target: 'header',
  });
  const menuTarget = menuTargetState.docId === docId ? menuTargetState.target : 'header';
  const setMenuTarget = (target: 'header' | 'note') => {
    setMenuTargetState((current) => current.docId === docId && current.target === target ? current : { docId, target });
  };
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const [editingToolbarHost, setEditingToolbarHost] = useState<HTMLDivElement | null>(null);
  const { requestZoomNoteId } = useEditorViewActions();
  const zoomPath = useZoomPath();
  const openDocument = useOpenDocument();
  const openDocumentView = openDocument?.view;
  const { documentDialog, openDelete, openRename, openShare } = useDocumentDialogs(headingRef, onSelectHome);
  const userData = useUserData();
  const metadataNote = useMemo(() => userData.documentRef(docId), [userData, docId]);
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

  const targetHeader = () => {
    if (!shellRef.current?.querySelector('[data-note-menu]')) setMenuTarget('header');
  };
  const listedDocument = userData.getDocuments().getById(docId);
  const documentNote = listedDocument ? (openDocument?.root ?? metadataNote) : null;
  const documentTitle = documentNote?.getText() ?? source.documentLabel;
  const documentLabel = formatNavigationLabel(documentTitle);
  const ownsDocument = documentNote?.canShareWith() === true;
  const recipientCount = ownsDocument ? documentNote.access.getChildren().length : 0;
  const shared = !ownsDocument || recipientCount > 0;
  const shareAction = ownsDocument ? 'Share document' : 'View document access';
  const shareAccess = ownsDocument
    ? (recipientCount === 0 ? 'Private · Only you have access' : `Shared by you · ${recipientCount + 1} people have access`)
    : 'Shared with you · You can edit';
  const shareLabel = `${shareAction} — ${shareAccess}`;
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

  let activeMenuTarget: 'header' | 'note' = 'note';
  if (zoomNoteId === null && documentNote) activeMenuTarget = search.searchModeActive ? 'header' : menuTarget;

  useEffect(() => {
    document.title = pageTitle;
    return () => {
      document.title = APP_TITLE;
    };
  }, [pageTitle]);

  return (
    <div
      className="document-editor-shell"
      data-menu-target={activeMenuTarget}
      ref={shellRef}
    >
      <DocumentToolbar
        documentLabel={documentTitle}
        keyboardReference={<KeyboardReference onClose={focusEditorInput} />}
        shareControl={documentNote && (
          <TooltipTrigger>
            <Button
              aria-label={shareLabel}
              className="document-share-button"
              data-shared={shared}
              onPress={() => openShare(documentNote, shareTriggerRef.current)}
              ref={shareTriggerRef}
            >
              <Icon fill={shared ? 'currentColor' : 'none'} icon={IconShare} size={20} />
            </Button>
            <Tooltip className="remdo-tooltip document-share-tooltip" placement="bottom">
              {shareLabel}
            </Tooltip>
          </TooltipTrigger>
        )}
        onSelectHome={onSelectHome}
        onSelectNoteId={requestZoomNoteId}
        onStatusHostChange={setStatusHost}
        path={zoomPath}
        searchControl={<DocumentSearchInput model={search} />}
      />
      {zoomNoteId === null && (
        <div
          className="location-header"
          onFocus={targetHeader}
          onPointerMove={targetHeader}
        >
          <div className="location-header-heading">
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
              {formatNavigationLabel(documentTitle, Number.POSITIVE_INFINITY)}
            </h1>
          </div>
          <div
            className="location-header-toolbar"
            ref={setEditingToolbarHost}
            style={{ visibility: search.searchModeActive ? 'hidden' : undefined }}
          />
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
          const outline = event.currentTarget.querySelector('.editor-input > :is(ul, ol)')?.getBoundingClientRect();
          if (outline && event.clientY >= outline.top && event.clientY <= outline.bottom) setMenuTarget('note');
        }}
      >
        <Editor
          key={docId}
          docId={docId}
          metadataNote={metadataNote}
          accountId={userId}
          statusPortalRoot={statusHost}
          editingToolbarPortalRoot={editingToolbarHost}
          onSelectHome={onSelectHome}
          onPendingDocumentImportError={handleImportError}
        />
      </div>
      {documentDialog}
    </div>
  );
}
