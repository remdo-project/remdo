import { Alert, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { rememberAuthenticatedSession } from '@/client/app/auth/client';
import { resolvePostAuthPath } from './post-auth-path';

export default function AdminUsersRoute() {
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
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          adminSecret,
          email: email.trim(),
          name: name.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error);
      }

      rememberAuthenticatedSession();
      const returnTo = await resolvePostAuthPath(location.search, globalThis.location.origin);
      void navigate(returnTo, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create the user.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Container size="xs" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1}>Create user</Title>
            <Text c="dimmed" size="sm">
              Use the server admin secret to provision a RemDo account.
            </Text>
          </div>

          {errorMessage && (
            <Alert color="red" title="User provisioning failed">
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
                Create user
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Container>
  );
}
