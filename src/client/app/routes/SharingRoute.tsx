import { Alert, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import {
  fetchLinkableSourceServers,
  linkSourceServerAccount,
} from '#client/app/auth/source-server-linking-client';
import type { LinkableSourceServerView } from '#client/app/auth/source-server-linking-client';
import {
  fetchDocumentAccess,
  shareDocumentWithUser,
} from '#client/app/documents/sharing-client';
import type { DocumentAccessView } from '#client/app/documents/sharing-client';
import { useUserData } from '#client/app/documents/user-data';

interface DocumentAccessState {
  docId: string;
  access: DocumentAccessView[];
}

export default function SharingRoute() {
  const userData = useUserData();
  const documents = userData.documents().children();
  const documentOptions = documents.map((document) => ({
    label: document.text(),
    value: document.id(),
  }));
  const [selectedDocId, setSelectedDocId] = useState(documentOptions[0]?.value ?? null);
  const [shareEmail, setShareEmail] = useState('');
  const [documentAccess, setDocumentAccess] = useState<DocumentAccessState | null>(null);
  const [linkableSourceServers, setLinkableSourceServers] = useState<LinkableSourceServerView[]>([]);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeDocId = selectedDocId ?? documentOptions[0]?.value ?? null;
  const activeDocIdRef = useRef(activeDocId);
  const visibleAccess = activeDocId && documentAccess?.docId === activeDocId ? documentAccess.access : [];

  useEffect(() => {
    activeDocIdRef.current = activeDocId;
  }, [activeDocId]);

  useEffect(() => {
    let stale = false;
    void fetchLinkableSourceServers()
      .then((servers) => {
        if (stale) {
          return;
        }
        setLinkableSourceServers(servers);
      })
      .catch((error: unknown) => {
        if (stale) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load source servers.');
      });
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    if (!activeDocId) {
      return;
    }
    let stale = false;
    void fetchDocumentAccess(activeDocId)
      .then((nextAccess) => {
        if (stale) {
          return;
        }
        setDocumentAccess({ docId: activeDocId, access: nextAccess });
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (stale) {
          return;
        }
        setDocumentAccess({ docId: activeDocId, access: [] });
        if (error instanceof Error && error.message === 'Document cannot be shared.') {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load document access.');
      });
    return () => {
      stale = true;
    };
  }, [activeDocId]);

  const shareDocument = async () => {
    if (!activeDocId) {
      return;
    }
    const email = shareEmail.trim();
    if (!email) {
      setErrorMessage('Enter a user email.');
      return;
    }

    try {
      const sharedDocId = activeDocId;
      await shareDocumentWithUser(sharedDocId, email);
      const nextAccess = await fetchDocumentAccess(sharedDocId);
      if (activeDocIdRef.current === sharedDocId) {
        setDocumentAccess({ docId: sharedDocId, access: nextAccess });
      }
      setShareEmail('');
      setStatus('Document shared.');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to share document.');
    }
  };

  const linkServer = async (serverId: string) => {
    try {
      await linkSourceServerAccount(serverId);
      setStatus('Source server account linked.');
      setErrorMessage(null);
      setLinkableSourceServers(await fetchLinkableSourceServers());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to link source server account.');
    }
  };

  return (
    <Stack gap="lg">
      {errorMessage && (
        <Alert color="red" title="Sharing failed">
          {errorMessage}
        </Alert>
      )}

      <Group align="end">
        <Select
          data={documentOptions}
          label="Document"
          value={activeDocId}
          onChange={setSelectedDocId}
        />
        <TextInput
          label="User email"
          type="email"
          value={shareEmail}
          onChange={(event) => setShareEmail(event.currentTarget.value)}
        />
        <Button onClick={() => void shareDocument()}>Share</Button>
      </Group>

      <Stack gap="xs">
        {visibleAccess.map((access) => (
          <Group key={access.granteeUserId} justify="space-between">
            <Stack gap={0}>
              <Text>{access.name || access.email}</Text>
              {access.name && <Text c="dimmed" size="sm">{access.email}</Text>}
            </Stack>
          </Group>
        ))}
      </Stack>

      {linkableSourceServers.length > 0 && (
        <Stack gap="xs">
          <Text fw={600}>Remote RemDo servers</Text>
          {linkableSourceServers.map((server) => (
            <Group key={server.id} justify="space-between">
              <Stack gap={0}>
                <Text>{server.label}</Text>
                <Text c="dimmed" size="sm">{server.baseUrl}</Text>
              </Stack>
              <Button
                disabled={server.linked}
                size="xs"
                variant={server.linked ? 'light' : 'filled'}
                onClick={() => void linkServer(server.id)}
              >
                {server.linked ? 'Linked' : 'Link'}
              </Button>
            </Group>
          ))}
        </Stack>
      )}

      {status && <Text aria-live="polite">{status}</Text>}
    </Stack>
  );
}
