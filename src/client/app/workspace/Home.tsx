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
import { useWorkspaces } from './workspaces/use-workspaces';
import { WorkspaceDocumentView } from './workspaces/WorkspaceDocumentView';
import './DocumentRoute.css';

export default function Home() {
  const { userData, data: sources = [], error, retry } = useUserDataRead(
    // The local source stays listed without documents, since workspaces join its list.
    userData => userData.sources.getChildren().filter(
      source => source.documents.getChildren().length > 0 || source.getLocal(),
    ),
  );
  const workspaces = useWorkspaces();
  const [openWorkspaceId, setOpenWorkspaceId] = useState<string | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const openWorkspace = workspaces.workspaces?.find((workspace) => workspace.getId() === openWorkspaceId);
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
    if (openWorkspace) return;
    document.title = `Home · ${APP_TITLE}`;
    return () => { document.title = APP_TITLE; };
  }, [openWorkspace]);

  if (openWorkspace) {
    return (
      <Container className="document-route-container" component="main" fluid>
        <WorkspaceDocumentView onClose={() => setOpenWorkspaceId(null)} workspace={openWorkspace} />
      </Container>
    );
  }

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
      {workspaces.error && (
        <Alert color="red" title="Could not load workspaces">
          <Button onClick={workspaces.retry}>Retry</Button>
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
        workspaces={workspaces.workspaces}
        onCreateDocument={() => setCreateDialogOpen(true)}
        onCreateWorkspace={workspaces.enabled ? () => setCreateWorkspaceOpen(true) : undefined}
        onSelectDocument={openDocument}
        onSelectWorkspace={(workspace) => setOpenWorkspaceId(workspace.getId())}
        onUploadDocument={(file) => { void actions.uploadDocument(file); }}
      />
      {createDialogOpen && (
        <DocumentCreateDialog
          existingNames={sources.flatMap((source) => source.documents.getChildren().map((document) => document.getText()))}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={actions.createDocument}
        />
      )}
      {createWorkspaceOpen && (
        <DocumentCreateDialog
          existingNames={workspaces.workspaces?.map((workspace) => workspace.getText()) ?? []}
          kind="workspace"
          onClose={() => setCreateWorkspaceOpen(false)}
          onCreate={async (name) => { setOpenWorkspaceId(await workspaces.create(name)); }}
        />
      )}
    </Container>
  );
}
