import { Stack } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { createDocumentPath, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';

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
    <Stack gap="xs">
      <ZoomBreadcrumbs
        docLabel={docId}
        path={zoomPath}
        onSelectNoteId={setZoomNoteId}
      />
      <Editor
        key={docId}
        docId={docId}
        zoomNoteId={zoomNoteId}
        onZoomNoteIdChange={setZoomNoteId}
        onZoomPathChange={setZoomPath}
      />
    </Stack>
  );
}
