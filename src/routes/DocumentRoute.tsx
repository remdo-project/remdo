import { Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { DEFAULT_DOC_ID } from '@/routing';

const normalizeZoomNoteId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export default function DocumentRoute() {
  const { docId: rawDocId } = useParams();
  const docId = rawDocId ?? DEFAULT_DOC_ID;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [zoomPath, setZoomPath] = useState<NotePathItem[]>([]);
  const zoomParam = searchParams.get('zoom');
  const zoomNoteId = useMemo(() => normalizeZoomNoteId(zoomParam), [zoomParam]);

  const setZoomNoteId = (noteId: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (noteId) {
      nextParams.set('zoom', noteId);
    } else {
      nextParams.delete('zoom');
    }
    const nextSearch = nextParams.toString();
    void navigate(
      {
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
        docId={docId}
        zoomNoteId={zoomNoteId}
        onZoomNoteIdChange={setZoomNoteId}
        onZoomPathChange={setZoomPath}
      />
    </Stack>
  );
}
