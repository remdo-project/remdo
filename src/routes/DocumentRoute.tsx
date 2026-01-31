import { Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import Editor from '@/editor/Editor';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import type { NotePathItem } from '@/editor/outline/note-traversal';

const normalizeZoomNoteId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export default function DocumentRoute() {
  const { docId } = useParams({ from: '/n/$docId' });
  const search = useSearch({ from: '/n/$docId' });
  const navigate = useNavigate({ from: '/n/$docId' });
  const [zoomPath, setZoomPath] = useState<NotePathItem[]>([]);
  const zoomNoteId = useMemo(() => normalizeZoomNoteId(search.zoom), [search.zoom]);

  const setZoomNoteId = (noteId: string | null) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        zoom: noteId ?? undefined,
      }),
      replace: true,
    });
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
