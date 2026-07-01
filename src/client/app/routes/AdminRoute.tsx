import { Alert, Anchor, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useLoaderData, useLocation, useNavigate } from 'react-router-dom';
import { rememberAuthenticatedSession } from '#client/app/auth/client';
import type { AdminRouteState } from './admin-route-loader';
import { resolveAdminEnrollPostCreateDestination } from './admin-enroll-post-create-destination';

export default function AdminRoute() {
  const state = useLoaderData<AdminRouteState>();

  if (state.kind === 'admin') {
    return (
      <Container size="xs" py="xl">
        <Paper withBorder p="xl" radius="md">
          <Stack gap="xs">
            <Title order={1}>Admin</Title>
            <Text c="dimmed" size="sm">
              You are an admin. The admin panel arrives with source-server linking.
            </Text>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return <EnrollForm createAccount={state.kind === 'enroll'} />;
}

function EnrollForm({ createAccount }: { createAccount: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  // "Log in first" returns to /admin (with any current search preserved), where
  // a now-signed-in visitor sees the secret-only promotion form.
  const loginHref = `/login?next=${encodeURIComponent(`/admin${location.search}`)}`;
  const [adminSecret, setAdminSecret] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    try {
      const accountFields = createAccount
        ? { email: email.trim(), name: name.trim(), password }
        : {};
      const response = await fetch('/api/admin/enroll', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ adminSecret, ...accountFields }),
      });

      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error);
      }

      rememberAuthenticatedSession();
      const destination = await resolveAdminEnrollPostCreateDestination(location.search, globalThis.location.origin);
      if (destination.kind === 'assign') {
        globalThis.location.assign(destination.href);
        return;
      }
      void navigate(destination.path, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to enroll as admin.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Container size="xs" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1}>Become admin</Title>
            <Text c="dimmed" size="sm">
              {createAccount
                ? 'Enter the admin secret, plus a name, email, and password to register the first admin.'
                : 'Enter the admin secret to make your account an admin.'}
            </Text>
          </div>

          {createAccount && (
            <Text c="dimmed" size="sm">
              Already have an account?{' '}
              <Anchor component={Link} to={loginHref}>
                Log in first
              </Anchor>
              , then enter just the secret.
            </Text>
          )}

          {errorMessage && (
            <Alert color="red" title="Enrollment failed">
              {errorMessage}
            </Alert>
          )}

          <form onSubmit={(event) => {
            void handleSubmit(event);
          }}>
            <Stack gap="md">
              <PasswordInput
                autoComplete="current-password"
                label="Admin secret"
                onChange={(event) => setAdminSecret(event.currentTarget.value)}
                required
                value={adminSecret}
              />
              {createAccount && (
                <>
                  <TextInput
                    autoComplete="name"
                    label="Name"
                    onChange={(event) => setName(event.currentTarget.value)}
                    required
                    value={name}
                  />
                  <TextInput
                    autoComplete="email"
                    label="Email"
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    required
                    type="email"
                    value={email}
                  />
                  <PasswordInput
                    autoComplete="new-password"
                    label="Password"
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    required
                    value={password}
                  />
                </>
              )}
              <Button loading={pending} type="submit">
                Become admin
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Container>
  );
}
