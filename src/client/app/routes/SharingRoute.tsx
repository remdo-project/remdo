import { Alert, Button, Container, Divider, Grid, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { linkSourceByUrl } from '#client/app/auth/source-server-linking-client';
import { useCurrentUserPublicServer, useUserData } from '#client/app/documents/user-data';

type ShareState =
  | { status: 'idle' | 'pending' | 'success' }
  | { status: 'error'; message: string };

export default function SharingRoute() {
  const userData = useUserData();
  // A public server is source-only and refuses to link out (the link route 403s),
  // so hide the link form there rather than advertise an action it rejects.
  const publicServer = useCurrentUserPublicServer();
  const documents = userData.documents().children();
  const userDataReady = documents.length > 0;
  const sourceServers = userData.sourceServers().children();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const shareableDocuments = documents.filter((document) => document.shareable());
  const documentOptions = shareableDocuments.map((document) => ({
    label: document.text(),
    value: document.id(),
  }));
  const activeDocument = shareableDocuments.find((document) => document.id() === selectedDocId);
  const [shareEmail, setShareEmail] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [shareState, setShareState] = useState<ShareState>({ status: 'idle' });
  const [sourceErrorMessage, setSourceErrorMessage] = useState<string | null>(null);
  const sharePending = shareState.status === 'pending';
  const visibleAccess = activeDocument?.access().children() ?? [];
  const showSourceSection = publicServer === false || sourceServers.length > 0;

  const selectDocument = (docId: string | null) => {
    setSelectedDocId(docId);
    if (selectedDocId) {
      setShareEmail('');
    }
    setShareState({ status: 'idle' });
  };

  const shareDocument = async () => {
    if (!activeDocument || sharePending) {
      return;
    }
    setShareState({ status: 'pending' });
    try {
      await activeDocument.shareWith(shareEmail.trim());
      setShareEmail('');
      setShareState({ status: 'success' });
    } catch (error) {
      setShareState({
        message: error instanceof Error ? error.message : 'Failed to share document.',
        status: 'error',
      });
    }
  };

  const linkByUrl = async () => {
    setSourceErrorMessage(null);
    try {
      await linkSourceByUrl(sourceUrl.trim());
    } catch (error) {
      setSourceErrorMessage(error instanceof Error ? error.message : 'Failed to link source.');
    }
  };

  return (
    <Container component="main" size="md" py="xl">
      <Stack gap="xl">
        <Title order={1}>Sharing</Title>

        <Stack aria-labelledby="document-access-heading" component="section" gap="md">
          <Title id="document-access-heading" order={2}>Document access</Title>
          {shareState.status === 'error' && (
            <Alert color="red" title="Could not share document">
              {shareState.message}
            </Alert>
          )}

          <form aria-busy={sharePending} aria-label="Share document" onSubmit={(event) => {
            event.preventDefault();
            void shareDocument();
          }}>
            <Grid align="flex-end" gap="sm">
              <Grid.Col span={{ base: 12, sm: 5 }}>
                <Select
                  data={documentOptions}
                  disabled={sharePending}
                  label="Document"
                  placeholder="Choose a document"
                  value={selectedDocId}
                  onChange={selectDocument}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 5 }}>
                <TextInput
                  label="User email"
                  disabled={sharePending}
                  required
                  type="email"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 2 }}>
                <Button disabled={!activeDocument} fullWidth loading={sharePending} type="submit">Share</Button>
              </Grid.Col>
            </Grid>
          </form>

          {!userDataReady ? null : documentOptions.length === 0 ? (
            <Text c="dimmed" size="sm">No documents you own can be shared.</Text>
          ) : !activeDocument ? (
            <Text c="dimmed" size="sm">Choose a document to manage access.</Text>
          ) : visibleAccess.length === 0 && shareState.status !== 'success' ? (
            <Text c="dimmed" size="sm">Only you have access.</Text>
          ) : visibleAccess.length > 0 ? (
            <Stack gap="xs">
              <Text component="h3" fw={600} size="sm">People with access</Text>
              {visibleAccess.map((access) => (
                <Stack key={access.id()} gap={0}>
                  <Text>{access.text()}</Text>
                  {access.name() && <Text c="dimmed" size="sm">{access.email()}</Text>}
                </Stack>
              ))}
            </Stack>
          ) : null}

          {shareState.status === 'success' && (
            <Text aria-live="polite">Document shared.</Text>
          )}
        </Stack>

        {showSourceSection && (
          <>
            <Divider />
            <Stack aria-labelledby="linked-sources-heading" component="section" gap="md">
              <Title id="linked-sources-heading" order={2}>Linked sources</Title>
              {sourceErrorMessage && (
                <Alert color="red" title="Could not link source">
                  {sourceErrorMessage}
                </Alert>
              )}

              {publicServer === false && (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  void linkByUrl();
                }}>
                  <Grid align="flex-end" gap="sm">
                    <Grid.Col span={{ base: 12, sm: 9 }}>
                      <TextInput
                        label="Source URL"
                        required
                        type="url"
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.currentTarget.value)}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                      <Button fullWidth type="submit">Link source</Button>
                    </Grid.Col>
                  </Grid>
                </form>
              )}

              {userDataReady && sourceServers.length === 0 ? (
                <Text c="dimmed" size="sm">No linked sources.</Text>
              ) : (
                <Stack gap="xs">
                  {sourceServers.map((server) => (
                    <Stack key={server.id()} gap={0}>
                      <Text>{server.text()}</Text>
                      <Text c="dimmed" size="sm">{server.baseUrl()}</Text>
                    </Stack>
                  ))}
                </Stack>
              )}

            </Stack>
          </>
        )}
      </Stack>
    </Container>
  );
}
