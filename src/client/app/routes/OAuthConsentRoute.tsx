import { Alert, Button, Group } from '@mantine/core';
import { useState } from 'react';
import CenteredCardPage from '#client/ui/CenteredCardPage';

// Better Auth redirects the authorize flow here (its configured consentPage) with
// the signed OAuth query in this page's URL. We echo that query back to
// /oauth2/consent to approve or deny, then follow the redirect it returns to
// continue (or abort) the authorize flow.
function readOAuthQuery(): string {
  if (typeof globalThis.location === 'undefined') {
    return '';
  }
  return globalThis.location.search.replace(/^\?/u, '');
}

function readClientId(): string | null {
  return new URLSearchParams(readOAuthQuery()).get('client_id');
}

async function submitConsent(accept: boolean): Promise<void> {
  const response = await fetch('/api/auth/oauth2/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ accept, oauth_query: readOAuthQuery() }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; redirect?: boolean; url?: string };
  if (!response.ok) {
    throw new Error(data.error ?? 'Consent request failed.');
  }
  // A successful consent must hand back a redirect target; without one there is
  // nowhere to go, so surface it as an error rather than leaving the buttons
  // stuck in their loading state with no feedback.
  if (!data.url) {
    throw new Error('Consent did not return a redirect target.');
  }
  globalThis.location.assign(data.url);
}

export default function OAuthConsentRoute() {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientId = readClientId();
  const description = clientId
    ? `A RemDo home server (${clientId}) is requesting access to your documents on this server.`
    : 'A RemDo home server is requesting access to your documents on this server.';

  const decide = (accept: boolean) => {
    setPending(true);
    setErrorMessage(null);
    void submitConsent(accept).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Consent request failed.');
      setPending(false);
    });
  };

  return (
    <CenteredCardPage description={description} title="Authorize access">
      {errorMessage && (
        <Alert color="red" title="Consent request failed">
          {errorMessage}
        </Alert>
      )}

      <Group justify="flex-end">
        <Button disabled={pending} onClick={() => decide(false)} variant="subtle">
          Deny
        </Button>
        <Button loading={pending} onClick={() => decide(true)}>
          Allow
        </Button>
      </Group>
    </CenteredCardPage>
  );
}
