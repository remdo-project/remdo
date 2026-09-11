import { useCallback } from 'react';
import { Container } from '@mantine/core';
import { useLoaderData, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
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

  const navigateToZoomNote = useCallback((noteId: string | null, zoomRequestId: number) => {
    const nextSearch = searchParams.toString();
    const pathname = createCanonicalDocumentPath(docId, noteId, homeDocumentId);
    void navigate(
      {
        pathname,
        search: pathname === '/' ? '' : nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true, state: { zoomRequestId } }
    );
  }, [docId, homeDocumentId, navigate, searchParams]);

  return { navigateToDocument, navigateToZoomNote };
}

export default function DocumentRoute() {
  const location = useLocation();
  const navigationType = useNavigationType();
  // History traversal is a new navigation intent, even when its entry was
  // originally created by an older zoom request.
  const zoomRequestId = navigationType === 'REPLACE'
    ? (location.state as { zoomRequestId?: number } | null)?.zoomRequestId
    : undefined;
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
        zoomRequestId={zoomRequestId}
      >
        <DocumentWorkspace
          docId={docId}
          zoomNoteId={zoomNoteId}
          zoomRequestId={zoomRequestId}
          onSelectDocument={navigateToDocument}
        />
      </EditorViewProvider>
    </Container>
  );
}
