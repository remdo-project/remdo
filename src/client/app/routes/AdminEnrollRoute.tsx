import { Alert, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { rememberAuthenticatedSession } from '#client/app/auth/client';
import { resolveAdminEnrollPostCreateDestination } from './admin-enroll-post-create-destination';

// Self-enrollment: present the admin secret to acquire the admin role. The
// account fields create + sign in a first admin on an empty server (works even
// with public signup off); an already-signed-in visitor is promoted in place,
// so they may submit with the secret alone. The server gates this on the secret
// (see docs/access-model.md#admin-role), never on an existing role.
export default function AdminEnrollRoute() {
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
      const trimmedEmail = email.trim();
      const trimmedName = name.trim();
      // Send account fields only when creating an account; an authenticated
      // visitor promoting in place submits the secret alone.
      const accountFields = trimmedEmail || trimmedName || password
        ? { email: trimmedEmail, name: trimmedName, password }
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
              Enter the server admin secret. On a new server, also fill in the
              account fields to register the first admin.
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
                value={name}
              />
              <TextInput
                autoComplete="email"
                label="Email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                type="email"
                value={email}
              />
              <PasswordInput
                autoComplete="new-password"
                label="Password"
                onChange={(event) => setPassword(event.currentTarget.value)}
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
