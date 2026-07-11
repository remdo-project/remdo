import { useCallback } from 'react';
import { Container } from '@mantine/core';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';
import { EditorViewProvider } from '#client/editor/view/EditorViewProvider';
import { createDocumentPath } from '#document-routes';
import type { ParsedDocumentRef } from '#document-routes';
import DocumentWorkspace from './document/DocumentWorkspace';

function useDocumentRouteNavigation(docId: string) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const navigateToDocument = useCallback((nextDocId: string) => {
    if (nextDocId === docId) {
      return;
    }
    const nextSearch = searchParams.toString();
    void navigate({
      pathname: createDocumentPath(nextDocId),
      search: nextSearch ? `?${nextSearch}` : '',
    });
  }, [docId, navigate, searchParams]);

  const navigateToZoomNote = useCallback((noteId: string | null) => {
    const nextSearch = searchParams.toString();
    void navigate(
      {
        pathname: createDocumentPath(docId, noteId),
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [docId, navigate, searchParams]);

  return { navigateToDocument, navigateToZoomNote };
}

export default function DocumentRoute() {
  const parsedRef = useLoaderData<ParsedDocumentRef>();
  const docId = parsedRef.docId;
  const zoomNoteId = parsedRef.noteId;
  const { navigateToDocument, navigateToZoomNote } = useDocumentRouteNavigation(docId);

  return (
    <Container component="main" size="xl" py="xl">
      <EditorViewProvider
        docId={docId}
        onZoomNoteIdChange={navigateToZoomNote}
        zoomNoteId={zoomNoteId}
      >
        <DocumentWorkspace
          docId={docId}
          onSelectDocument={navigateToDocument}
        />
      </EditorViewProvider>
    </Container>
  );
}
