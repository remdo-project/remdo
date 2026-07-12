import { useCallback } from 'react';
import { Container } from '@mantine/core';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';
import { EditorViewProvider } from '#client/editor/view/EditorViewProvider';
import { createCanonicalDocumentPath } from '#document-routes';
import type { ParsedDocumentRef } from '#document-routes';
import DocumentWorkspace from './document/DocumentWorkspace';

function useDocumentRouteNavigation(docId: string, homeDocumentId: string) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const navigateToDocument = useCallback((nextDocId: string) => {
    if (nextDocId === docId) {
      return;
    }
    const nextSearch = searchParams.toString();
    const pathname = createCanonicalDocumentPath(nextDocId, null, homeDocumentId);
    void navigate({
      pathname,
      search: pathname === '/' ? '' : nextSearch ? `?${nextSearch}` : '',
    });
  }, [docId, homeDocumentId, navigate, searchParams]);

  const navigateToZoomNote = useCallback((noteId: string | null) => {
    const nextSearch = searchParams.toString();
    const pathname = createCanonicalDocumentPath(docId, noteId, homeDocumentId);
    void navigate(
      {
        pathname,
        search: pathname === '/' ? '' : nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [docId, homeDocumentId, navigate, searchParams]);

  return { navigateToDocument, navigateToZoomNote };
}

export default function DocumentRoute() {
  const parsedRef = useLoaderData<ParsedDocumentRef & { homeDocumentId: string }>();
  const docId = parsedRef.docId;
  const zoomNoteId = parsedRef.noteId;
  const { navigateToDocument, navigateToZoomNote } = useDocumentRouteNavigation(
    docId,
    parsedRef.homeDocumentId,
  );

  return (
    <Container className="document-route-container" component="main" fluid py="xs">
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
