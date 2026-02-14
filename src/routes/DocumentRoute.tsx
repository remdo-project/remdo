import { useState } from 'react';
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
        <div className="document-header-status" ref={setStatusHost} />
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
