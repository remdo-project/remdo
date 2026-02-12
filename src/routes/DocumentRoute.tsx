import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import { createDocumentPath, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';
import './DocumentRoute.css';

export default function DocumentRoute() {
  const { docRef } = useParams<{ docRef?: string }>();
  const parsedRef = parseDocumentRef(docRef);
  const docId = parsedRef?.docId ?? DEFAULT_DOC_ID;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [zoomPath, setZoomPath] = useState<NotePathItem[]>([]);
  const zoomNoteId = parsedRef?.noteId ?? null;

  const setZoomNoteId = (noteId: string | null) => {
    const nextSearch = searchParams.toString();
    void navigate(
      {
        pathname: createDocumentPath(docId, noteId),
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  };

  return (
    <div className="document-editor-shell">
      <header className="document-zoom-header">
        <ZoomBreadcrumbs
          docLabel={docId}
          path={zoomPath}
          onSelectNoteId={setZoomNoteId}
        />
      </header>
      <Editor
        key={docId}
        docId={docId}
        zoomNoteId={zoomNoteId}
        onZoomNoteIdChange={setZoomNoteId}
        onZoomPathChange={setZoomPath}
      />
    </div>
  );
}
