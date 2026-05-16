import { Alert, Anchor, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authClient, rememberAuthenticatedSession } from '@/auth/client';
import { resolvePostAuthPath } from './post-auth-path';

function readAuthErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
      return maybeMessage;
    }
  }
  return fallback;
}

export default function LoginRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const completeAuth = async () => {
    rememberAuthenticatedSession();
    const returnTo = await resolvePostAuthPath(location.search);
    void navigate(returnTo, { replace: true });
  };

  const handleLoginSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (result.error) {
        setErrorMessage(readAuthErrorMessage(result.error, 'Failed to sign in.'));
        return;
      }
      await completeAuth();
    } catch (error) {
      setErrorMessage(readAuthErrorMessage(error, 'Failed to sign in.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Container size="xs" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1}>Sign in</Title>
            <Text c="dimmed" size="sm">
              Sign in to access your documents.
            </Text>
          </div>

          {errorMessage && (
            <Alert color="red" title="Authentication failed">
              {errorMessage}
            </Alert>
          )}

          <form onSubmit={(event) => {
            void handleLoginSubmit(event);
          }}>
            <Stack gap="md">
              <TextInput
                autoComplete="email"
                label="Email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                type="email"
                value={email}
              />
              <PasswordInput
                autoComplete="current-password"
                label="Password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
                value={password}
              />
              <Button loading={pending} type="submit">
                Sign in
              </Button>
            </Stack>
          </form>

          <Text c="dimmed" size="sm">
            Need to create an account?{' '}
            <Anchor component={Link} to={`/admin/users/new${location.search}`}>
              Open admin provisioning
            </Anchor>
            .
          </Text>
        </Stack>
      </Paper>
    </Container>
  );
}
