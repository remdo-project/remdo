import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { isHttpOrigin } from '#platform/net/http-origin';

// A home redirects an admin here (on the source) to register itself as an OAuth
// client. Registration is a deliberate POST the admin makes by clicking Authorize,
// so a cross-site navigation to this page cannot register anything on its own.
interface RegisterRequest {
  handle: string;
  home: string;
  state: string;
}

// `home` is used as a navigation target on Cancel, so it must be a real http(s)
// origin (isHttpOrigin) — never an arbitrary scheme like `javascript:`. Treating
// a non-origin value as an invalid request keeps it out of the Cancel nav and POST.
function readRequest(): RegisterRequest | null {
  if (typeof globalThis.location === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(globalThis.location.search);
  const handle = params.get('handle');
  const home = params.get('home');
  const state = params.get('state');
  if (!handle || !home || !state || !isHttpOrigin(home)) {
    return null;
  }
  return { handle, home, state };
}

async function authorize(request: RegisterRequest): Promise<void> {
  const response = await fetch('/api/link/register-home', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(request),
  });
  if (response.status === 401) {
    // Not signed in on this source yet: sign in, then return here to authorize.
    const next = `${globalThis.location.pathname}${globalThis.location.search}`;
    globalThis.location.assign(`/login?next=${encodeURIComponent(next)}`);
    return;
  }
  const data = await response.json().catch(() => ({})) as { error?: string; redirectUrl?: string };
  if (!response.ok || !data.redirectUrl) {
    throw new Error(data.error ?? 'Registration failed.');
  }
  globalThis.location.assign(data.redirectUrl);
}

export default function OAuthRegisterHomeRoute() {
  const [request] = useState(readRequest);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onAuthorize = () => {
    if (!request) {
      return;
    }
    setPending(true);
    setErrorMessage(null);
    void authorize(request).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Registration failed.');
      setPending(false);
    });
  };

  const onCancel = () => {
    globalThis.location.assign(request ? `${request.home}/admin` : '/');
  };

  return (
    <Container size="xs" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1}>Register a home server</Title>
            <Text c="dimmed" size="sm">
              {request
                ? `The RemDo home server at ${request.home} wants to register against your account on this server, so its users can link source documents.`
                : 'This registration request is missing or invalid.'}
            </Text>
          </div>

          {errorMessage && (
            <Alert color="red" title="Registration failed">
              {errorMessage}
            </Alert>
          )}

          {request && (
            <Group justify="flex-end">
              <Button disabled={pending} onClick={onCancel} variant="subtle">
                Cancel
              </Button>
              <Button loading={pending} onClick={onAuthorize}>
                Authorize
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
