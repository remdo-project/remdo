import { Alert, Button, Container, Grid, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useUserData } from '#client/app/user-data/user-data';

type ShareState =
  | { status: 'idle' | 'pending' | 'success' }
  | { status: 'error'; message: string };

export default function SharingRoute() {
  const userData = useUserData();
  const documents = userData.getDocuments().getChildren();
  const userDataReady = documents.length > 0;
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const shareableDocuments = documents.filter((document) => document.canShareWith());
  const documentOptions = shareableDocuments.map((document) => ({
    label: document.getText(),
    value: document.getId(),
  }));
  const activeDocument = shareableDocuments.find((document) => document.getId() === selectedDocId);
  const [shareEmail, setShareEmail] = useState('');
  const [shareState, setShareState] = useState<ShareState>({ status: 'idle' });
  const sharePending = shareState.status === 'pending';
  const visibleAccess = activeDocument?.getAccess().getChildren() ?? [];

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
                <Stack key={access.getId()} gap={0}>
                  <Text>{access.getText()}</Text>
                  {access.getName() && <Text c="dimmed" size="sm">{access.getEmail()}</Text>}
                </Stack>
              ))}
            </Stack>
          ) : null}

          {shareState.status === 'success' && (
            <Text aria-live="polite">Document shared.</Text>
          )}
        </Stack>

      </Stack>
    </Container>
  );
}
