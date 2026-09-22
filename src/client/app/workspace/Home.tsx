import { Alert, Button, Container, Stack } from '@mantine/core';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDocumentPath } from '#document-routes';
import { APP_TITLE } from '#client/ui/navigation-label';
import { useUserData, useUserDataStatus } from '#client/app/user-data/user-data';
import { HomeView } from './document/HomeView';
import { buildHomeContent } from './document/home-content';
import { useDocumentActions } from './document/useDocumentActions';
import './DocumentRoute.css';

export default function Home() {
  const userData = useUserData();
  const status = useUserDataStatus();
  const navigate = useNavigate();
  const openDocument = useCallback((docId: string) => {
    void navigate(createDocumentPath(docId));
  }, [navigate]);
  const actions = useDocumentActions({ onSelectDocument: openDocument, userData });
  const home = buildHomeContent(userData.getDocumentSources().getChildren());

  useEffect(() => {
    document.title = `Home · ${APP_TITLE}`;
    return () => { document.title = APP_TITLE; };
  }, []);

  return (
    <Container className="document-route-container" component="main" fluid py="xs">
      {status.error && (
        <Alert color="red" title="Could not load documents">
          <Stack align="flex-start" gap="xs">
            {status.error}
            <Button onClick={status.retry}>Retry</Button>
          </Stack>
        </Alert>
      )}
      {actions.createError && (
        <Alert closeButtonLabel="Dismiss" color="red" onClose={actions.dismissCreateError} title="Could not create document" withCloseButton>
          {actions.createError}
        </Alert>
      )}
      <HomeView
        {...home}
        onCreateDocument={() => { void actions.createDocument(); }}
        onSelectDocument={openDocument}
        onUploadDocument={(file) => { void actions.uploadDocument(file); }}
        resolveDocument={(docId) => userData.getDocuments().getById(docId)}
      />
    </Container>
  );
}
