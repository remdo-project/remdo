import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import { createDocumentPathForPathname, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';
import './DocumentRoute.css';

export default function DocumentRoute() {
  const { docRef } = useParams<{ docRef?: string }>();
  const parsedRef = parseDocumentRef(docRef);
  const docId = parsedRef?.docId ?? DEFAULT_DOC_ID;
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [zoomPath, setZoomPath] = useState<NotePathItem[]>([]);
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const zoomNoteId = parsedRef?.noteId ?? null;

  const setZoomNoteId = (noteId: string | null) => {
    const nextSearch = searchParams.toString();
    void navigate(
      {
        pathname: createDocumentPathForPathname(location.pathname, docId, noteId),
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  };

  const focusEditorInput = () => {
    const editorInput = document.querySelector<HTMLElement>('.editor-input');
    if (!editorInput) {
      return false;
    }
    editorInput.focus();
    return true;
  };

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return;
      }
      const isFindShortcut = event.code === 'KeyF' || (!!event.key && event.key.toLowerCase() === 'f');
      if (!isFindShortcut) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      const searchInput = searchInputRef.current;
      if (!searchInput) {
        return;
      }

      // Allow browser find on the next press when search is already focused.
      if (document.activeElement === searchInput) {
        return;
      }

      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    };

    document.addEventListener('keydown', handleFindShortcut);
    return () => {
      document.removeEventListener('keydown', handleFindShortcut);
    };
  }, []);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }
    if (focusEditorInput()) {
      event.preventDefault();
      return;
    }
    event.currentTarget.blur();
  };

  return (
    <div className="document-editor-shell">
      <header className="document-header">
        <div className="document-header-breadcrumbs">
          <ZoomBreadcrumbs
            docLabel={docId}
            path={zoomPath}
            onSelectNoteId={setZoomNoteId}
          />
        </div>
        <div className="document-header-actions">
          <TextInput
            aria-label="Search document"
            className="document-header-search remdo-interaction-surface"
            ref={searchInputRef}
            leftSection={<IconSearch aria-hidden="true" size={14} />}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search"
            size="xs"
          />
          <div className="document-header-status" ref={setStatusHost} />
        </div>
      </header>
      <Editor
        key={docId}
        docId={docId}
        statusPortalRoot={statusHost}
        zoomNoteId={zoomNoteId}
        onZoomNoteIdChange={setZoomNoteId}
        onZoomPathChange={setZoomPath}
      />
    </div>
  );
}
