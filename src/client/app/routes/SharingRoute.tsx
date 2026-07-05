import { Alert, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { linkSourceByUrl } from '#client/app/auth/source-server-linking-client';
import { useCurrentUserPublicServer, useUserData } from '#client/app/documents/user-data';
import { createShareableDocumentOptions } from './sharing-documents';
import type { SourceServerNote } from '#note-sdk';

export default function SharingRoute() {
  const userData = useUserData();
  // A public server is source-only and refuses to link out (the link route 403s),
  // so hide the link form there rather than advertise an action it rejects.
  const isPublicServer = useCurrentUserPublicServer();
  const documents = userData.documents().children();
  const sourceServers = userData.sourceServers().children();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const documentOptions = createShareableDocumentOptions(documents);
  const shareableDocumentIds = new Set(documentOptions.map((option) => option.value));
  const activeDocument = selectedDocId
    ? documents.find((document) => document.id() === selectedDocId && shareableDocumentIds.has(document.id())) ?? null
    : null;
  const [shareEmail, setShareEmail] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visibleAccess = activeDocument?.access().children() ?? [];

  const shareDocument = async () => {
    if (!activeDocument) {
      return;
    }
    try {
      await activeDocument.shareWith(shareEmail.trim());
      setShareEmail('');
      setStatus('Document shared.');
      setErrorMessage(null);
    } catch (error) {
      setStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to share document.');
    }
  };

  const linkServer = async (sourceServer: SourceServerNote) => {
    try {
      await sourceServer.link();
      setStatus('Source server account linked.');
      setErrorMessage(null);
    } catch (error) {
      setStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to link source server account.');
    }
  };

  const linkByUrl = async () => {
    try {
      await linkSourceByUrl(sourceUrl.trim());
      setStatus('Redirecting to authorize the source…');
      setErrorMessage(null);
    } catch (error) {
      setStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to link source.');
    }
  };

  return (
    <Stack gap="lg">
      {errorMessage && (
        <Alert color="red" title="Sharing failed">
          {errorMessage}
        </Alert>
      )}

      <form onSubmit={(event) => {
        event.preventDefault();
        void shareDocument();
      }}>
        <Group align="end">
          <Select
            data={documentOptions}
            label="Document"
            value={selectedDocId}
            onChange={setSelectedDocId}
          />
          <TextInput
            label="User email"
            required
            type="email"
            value={shareEmail}
            onChange={(event) => setShareEmail(event.currentTarget.value)}
          />
          <Button disabled={!activeDocument} type="submit">Share</Button>
        </Group>
      </form>

      <Stack gap="xs">
        {visibleAccess.map((access) => (
          <Group key={access.granteeUserId()} justify="space-between">
            <Stack gap={0}>
              <Text>{access.name() || access.email()}</Text>
              {access.name() && <Text c="dimmed" size="sm">{access.email()}</Text>}
            </Stack>
          </Group>
        ))}
      </Stack>

      {!isPublicServer && (
        <form onSubmit={(event) => {
          event.preventDefault();
          void linkByUrl();
        }}>
          <Group align="end">
            <TextInput
              label="Source URL"
              required
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.currentTarget.value)}
            />
            <Button type="submit">Link source</Button>
          </Group>
        </form>
      )}

      {sourceServers.length > 0 && (
        <Stack gap="xs">
          <Text fw={600}>Linked sources</Text>
          {sourceServers.map((server) => (
            <Group key={server.id()} justify="space-between">
              <Stack gap={0}>
                <Text>{server.text()}</Text>
                <Text c="dimmed" size="sm">{server.baseUrl()}</Text>
              </Stack>
              <Button
                disabled={server.linked()}
                size="xs"
                variant={server.linked() ? 'light' : 'filled'}
                onClick={() => void linkServer(server)}
              >
                {server.linked() ? 'Linked' : 'Link'}
              </Button>
            </Group>
          ))}
        </Stack>
      )}

      {status && <Text aria-live="polite">{status}</Text>}
    </Stack>
  );
}
