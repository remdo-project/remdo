import { useCallback } from 'react';
import { Container } from '@mantine/core';
import { useLoaderData, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
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
    const pathname = createDocumentPath(nextDocId);
    void navigate({
      pathname,
      search: nextSearch ? `?${nextSearch}` : '',
    });
  }, [docId, navigate, searchParams]);

  const navigateToZoomNote = useCallback((noteId: string | null, zoomRequestId: number) => {
    const nextSearch = searchParams.toString();
    const pathname = createDocumentPath(docId, noteId);
    void navigate(
      {
        pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true, state: { zoomRequestId } }
    );
  }, [docId, navigate, searchParams]);

  const navigateHome = useCallback(() => { void navigate('/'); }, [navigate]);

  return { navigateHome, navigateToDocument, navigateToZoomNote };
}

export default function DocumentRoute() {
  const location = useLocation();
  const navigationType = useNavigationType();
  // History traversal is a new navigation intent, even when its entry was
  // originally created by an older zoom request.
  const zoomRequestId = navigationType === 'REPLACE'
    ? (location.state as { zoomRequestId?: number } | null)?.zoomRequestId
    : undefined;
  const parsedRef = useLoaderData<ParsedDocumentRef>();
  const docId = parsedRef.docId;
  const zoomNoteId = parsedRef.noteId;
  const { navigateHome, navigateToDocument, navigateToZoomNote } = useDocumentRouteNavigation(docId);

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
          onSelectDocument={navigateToDocument}
          onSelectHome={navigateHome}
        />
      </EditorViewProvider>
    </Container>
  );
}
