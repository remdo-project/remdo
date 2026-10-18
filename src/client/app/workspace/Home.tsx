import { Alert, Button, Container, Stack } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { createDocumentPath } from '#document-routes';
import { APP_TITLE } from '#client/ui/navigation-label';
import { useUserDataRead } from '#client/app/user-data/use-user-data-read';
import { HomeView } from './document/HomeView';
import { DocumentCreateDialog } from './document/DocumentCreateDialog';
import { useDocumentActions } from './document/useDocumentActions';
import { isFocusDocumentSearchState } from './useDocumentSearchShortcut';
import './DocumentRoute.css';

export default function Home() {
  const { userData, data: sources = [], error, retry } = useUserDataRead(
    userData => userData.sources.getChildren().filter(source => source.documents.getChildren().length > 0),
  );
  const navigate = useNavigate();
  const location = useLocation();
  // History traversal is a new navigation intent: Back to this entry must not
  // pull focus into the field again.
  const focusSearchRequested = useNavigationType() === 'PUSH' && isFocusDocumentSearchState(location.state);
  const openDocument = useCallback((docId: string) => {
    void navigate(createDocumentPath(docId));
  }, [navigate]);
  const actions = useDocumentActions({ onSelectDocument: openDocument, userData });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    document.title = `Home · ${APP_TITLE}`;
    return () => { document.title = APP_TITLE; };
  }, []);

  return (
    <Container className="document-route-container" component="main" fluid>
      {error && (
        <Alert color="red" title="Could not load documents">
          <Stack align="flex-start" gap="xs">
            {error}
            <Button onClick={retry}>Retry</Button>
          </Stack>
        </Alert>
      )}
      {actions.createError && (
        <Alert closeButtonLabel="Dismiss" color="red" onClose={actions.dismissCreateError} title="Could not create document" withCloseButton>
          {actions.createError}
        </Alert>
      )}
      <HomeView
        focusSearchRequested={focusSearchRequested}
        sources={sources}
        onCreateDocument={() => setCreateDialogOpen(true)}
        onSelectDocument={openDocument}
        onUploadDocument={(file) => { void actions.uploadDocument(file); }}
      />
      {createDialogOpen && (
        <DocumentCreateDialog
          existingNames={sources.flatMap((source) => source.documents.getChildren().map((document) => document.getText()))}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={actions.createDocument}
        />
      )}
    </Container>
  );
}
