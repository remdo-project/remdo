import { Alert, Badge, Button, Container, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';

interface AdminSourceServer {
  id: string;
  label: string;
  baseUrl: string;
  registered: boolean;
}

interface PendingClaim {
  sourceId: string;
  handle: string;
  code: string;
}

// After the source redirects back, the URL carries the handle this home issued
// and the one-time code to pull the registered credentials with. Pure read (no
// side effects), so it is safe as a render-phase state initializer; the address
// bar is cleared separately from an effect.
function readPendingClaim(): PendingClaim | null {
  if (typeof globalThis.location === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(globalThis.location.search);
  const sourceId = params.get('sourceId');
  const handle = params.get('handle');
  const code = params.get('code');
  if (!sourceId || !handle || !code) {
    return null;
  }
  return { sourceId, handle, code };
}

// Admin requests are authorized by the caller's admin-role session cookie; there
// is no secret in the body. A GET has no body.
async function adminGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? 'Source server request failed.');
  }
  return data;
}

async function adminPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? 'Source server request failed.');
  }
  return data;
}

// The source-server management panel behind /admin. Add a source, register this
// home on it (a source redirect the admin completes there), see registered
// state, and remove a source. All actions are role-gated server-side.
export default function AdminSourceServersRoute() {
  const [url, setUrl] = useState('');
  const [servers, setServers] = useState<AdminSourceServer[] | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialClaim] = useState(readPendingClaim);
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(initialClaim);
  const [notice, setNotice] = useState<string | null>(
    initialClaim ? 'Signed in on the source. Finish registering this home below.' : null,
  );

  // Strip the one-time claim params from the address bar after they are read into
  // state — an effect, not the render-phase initializer, so a double render (e.g.
  // StrictMode) cannot clear the URL before the first read captures the claim.
  useEffect(() => {
    if (initialClaim && typeof globalThis.location !== 'undefined') {
      globalThis.history.replaceState(null, '', globalThis.location.pathname);
    }
  }, [initialClaim]);

  // Fire-and-forget: handlers are wired to onClick (void), errors surface via state.
  const run = (action: () => Promise<void>): void => {
    setPending(true);
    setErrorMessage(null);
    void (async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Source server request failed.');
      } finally {
        setPending(false);
      }
    })();
  };

  const reloadServers = async () => {
    const { servers: loaded } = await adminGet<{ servers: AdminSourceServer[] }>('/api/admin/source-servers');
    setServers(loaded);
  };

  // Load the configured sources on mount; the list is always shown, not gated
  // behind a button. Errors surface via state, mirroring the action handlers.
  useEffect(() => {
    void (async () => {
      try {
        const { servers: loaded } = await adminGet<{ servers: AdminSourceServer[] }>('/api/admin/source-servers');
        setServers(loaded);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Source server request failed.');
      }
    })();
  }, []);

  const launchRegistration = async (id: string) => {
    const { redirectUrl } = await adminPost<{ redirectUrl: string }>(
      `/api/link/source-servers/${encodeURIComponent(id)}/register`,
    );
    // Top-level navigation so the admin's source session cookie rides along.
    globalThis.location.assign(redirectUrl);
  };

  // Add the source, then launch registration straight away — the common path is
  // "add and register" in one step. If registration fails (or the source rejects
  // it), the row is already added as Not registered, so its per-row Register
  // button is the retry.
  const addAndRegister = () => run(async () => {
    const { server } = await adminPost<{ server: AdminSourceServer }>(
      '/api/admin/source-servers',
      { url: url.trim() },
    );
    setUrl('');
    await reloadServers();
    await launchRegistration(server.id);
  });

  const register = (id: string) => run(() => launchRegistration(id));

  const remove = (id: string) => run(async () => {
    await adminPost(`/api/admin/source-servers/${encodeURIComponent(id)}/remove`);
    await reloadServers();
  });

  // After returning from the source, pull the registered credentials with the
  // one-time code and finish registration on the home.
  const completeClaim = () => run(async () => {
    if (!pendingClaim) {
      return;
    }
    await adminPost(`/api/link/source-servers/${encodeURIComponent(pendingClaim.sourceId)}/claim`, {
      handle: pendingClaim.handle,
      code: pendingClaim.code,
    });
    setPendingClaim(null);
    setNotice('Registered. This source is now linkable.');
    await reloadServers();
  });

  return (
    <Container size="sm" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1}>Source servers</Title>
            <Text c="dimmed" size="sm">
              Register this home on a RemDo server it may link to. Registering opens
              the source so you can sign in there; once it completes, the source is
              immediately available to link. Use a row's Register to retry or
              re-register.
            </Text>
          </div>

          {errorMessage && (
            <Alert color="red" title="Source server request failed">
              {errorMessage}
            </Alert>
          )}
          {notice && (
            <Alert color="blue" title="Source registration">
              {notice}
            </Alert>
          )}

          {pendingClaim && (
            <Button color="green" loading={pending} onClick={completeClaim}>
              Finish registering this home
            </Button>
          )}

          <Group align="end" gap="sm">
            <TextInput
              label="Source server URL"
              onChange={(event) => setUrl(event.currentTarget.value)}
              placeholder="https://remdo.com"
              style={{ flex: 1 }}
              value={url}
            />
            <Button disabled={!url.trim()} loading={pending} onClick={addAndRegister}>
              Register
            </Button>
          </Group>

          {servers?.length === 0 && <Text c="dimmed" size="sm">No source servers configured.</Text>}
          {servers?.map((server) => (
            <Group justify="space-between" key={server.id}>
              <div>
                <Text>{server.label}</Text>
                <Text c="dimmed" size="sm">{server.baseUrl}</Text>
              </div>
              <Group gap="xs">
                <Badge color={server.registered ? 'green' : 'gray'}>
                  {server.registered ? 'Registered' : 'Not registered'}
                </Badge>
                <Button loading={pending} onClick={() => register(server.id)} size="xs" variant="light">
                  {server.registered ? 'Re-register' : 'Register'}
                </Button>
                <Button color="red" loading={pending} onClick={() => remove(server.id)} size="xs" variant="subtle">
                  Remove
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      </Paper>
    </Container>
  );
}
