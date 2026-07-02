import { Alert, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useLoaderData, useLocation, useNavigate } from 'react-router-dom';
import { rememberAuthenticatedSession } from '#client/app/auth/client';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';
import AdminSourceServersRoute from './AdminSourceServersRoute';
import type { AdminRouteState } from './admin-route-loader';
import { resolveAdminEnrollPostCreateDestination } from './admin-enroll-post-create-destination';

export default function AdminRoute() {
  const state = useLoaderData<AdminRouteState>();

  if (state.kind === 'admin') {
    // The admin panel currently manages the home's source servers.
    return <AdminSourceServersRoute />;
  }

  return <EnrollForm />;
}

// Enrollment always registers a new admin account (the secret gates it, works
// even with signup disabled). Promoting an existing user is a later, panel-gated
// capability, so this form has a single mode.
function EnrollForm() {
  const location = useLocation();
  const navigate = useNavigate();
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
      const response = await fetch('/api/admin/enroll', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ adminSecret, email: email.trim(), name: name.trim(), password }),
      });

      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error);
      }

      rememberAuthenticatedSession();
      // Enrollment created + signed in a new admin, so the cached bootstrap is
      // stale — clear it so the next /api/current-user read reflects the new user.
      clearCurrentUserBootstrapCache();
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
              Enter the admin secret, plus a name, email, and password to register
              an admin account.
            </Text>
          </div>

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
