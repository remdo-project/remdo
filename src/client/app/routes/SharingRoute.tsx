import { Alert, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import {
  fetchLinkableSourceServers,
  linkSourceServerAccount,
} from '#client/app/auth/source-server-linking-client';
import type { LinkableSourceServerView } from '#client/app/auth/source-server-linking-client';
import {
  approveDocumentAccessRequest,
  fetchAccessRequests,
  requestDocumentAccess,
  setDocumentAccessMode,
} from '#client/app/documents/sharing-client';
import type { AccessRequestView } from '#client/app/documents/sharing-client';
import { useUserData } from '#client/app/documents/user-data';
import { normalizeDocumentId } from '#domain/documents/ids';
import { parseDocumentRef } from '#document-routes';

// Match only local whole-document routes; note-level refs are rejected below.
const DOCUMENT_PATH_PATTERN = /^\/n\/([^/]+)$/u;

interface AccessRequestsState {
  docId: string;
  requests: AccessRequestView[];
}

function parseDocumentIdInput(input: string): string | null {
  const trimmed = input.trim();
  const directId = normalizeDocumentId(trimmed);
  if (directId) {
    return directId;
  }

  let url: URL;
  try {
    url = new URL(trimmed, globalThis.location.origin);
  } catch {
    return null;
  }

  if (url.origin !== globalThis.location.origin) {
    return null;
  }

  const match = url.pathname.match(DOCUMENT_PATH_PATTERN);
  if (!match) {
    return null;
  }

  const parsed = parseDocumentRef(match[1]);
  return parsed?.noteId === null ? parsed.docId : null;
}

export default function SharingRoute() {
  const userData = useUserData();
  const documents = userData.documents().children();
  const documentOptions = documents.map((document) => ({
    label: document.text(),
    value: document.id(),
  }));
  const [selectedDocId, setSelectedDocId] = useState(documentOptions[0]?.value ?? null);
  const [requestInput, setRequestInput] = useState('');
  const [accessRequests, setAccessRequests] = useState<AccessRequestsState | null>(null);
  const [linkableSourceServers, setLinkableSourceServers] = useState<LinkableSourceServerView[]>([]);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeDocId = selectedDocId ?? documentOptions[0]?.value ?? null;
  const activeDocIdRef = useRef(activeDocId);
  const visibleRequests = activeDocId && accessRequests?.docId === activeDocId ? accessRequests.requests : [];

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
    void fetchAccessRequests(activeDocId)
      .then((nextRequests) => {
        if (stale) {
          return;
        }
        setAccessRequests({ docId: activeDocId, requests: nextRequests });
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (stale) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load access requests.');
      });
    return () => {
      stale = true;
    };
  }, [activeDocId]);

  const changeAccessMode = async (accessMode: 'private' | 'shareable') => {
    if (!activeDocId) {
      return;
    }
    try {
      await setDocumentAccessMode(activeDocId, accessMode);
      setStatus(`Set ${accessMode}.`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update access mode.');
    }
  };

  const requestAccess = async () => {
    const docId = parseDocumentIdInput(requestInput);
    if (!docId) {
      setErrorMessage('Enter a valid local document URL or id.');
      return;
    }

    try {
      await requestDocumentAccess(docId);
      setStatus('Access request sent.');
      setRequestInput('');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to request access.');
    }
  };

  const approveRequest = async (requesterUserId: string) => {
    if (!activeDocId) {
      return;
    }
    try {
      const approvedDocId = activeDocId;
      await approveDocumentAccessRequest(approvedDocId, requesterUserId);
      const nextRequests = await fetchAccessRequests(approvedDocId);
      if (activeDocIdRef.current === approvedDocId) {
        setAccessRequests({ docId: approvedDocId, requests: nextRequests });
      }
      setStatus('Access approved.');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to approve access.');
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
        <TextInput
          label="Document URL or id"
          value={requestInput}
          onChange={(event) => setRequestInput(event.currentTarget.value)}
        />
        <Button onClick={() => void requestAccess()}>Request</Button>
      </Group>

      <Group align="end">
        <Select
          data={documentOptions}
          label="Document"
          value={activeDocId}
          onChange={setSelectedDocId}
        />
        <Button onClick={() => void changeAccessMode('shareable')}>Shareable</Button>
        <Button variant="light" onClick={() => void changeAccessMode('private')}>Private</Button>
      </Group>

      <Stack gap="xs">
        {visibleRequests.map((request) => (
          <Group key={request.requesterUserId} justify="space-between">
            <Text>
              {request.requesterUserId}
              {' '}
              ({request.status})
            </Text>
            <Button
              disabled={request.status !== 'pending'}
              size="xs"
              onClick={() => void approveRequest(request.requesterUserId)}
            >
              Approve
            </Button>
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
