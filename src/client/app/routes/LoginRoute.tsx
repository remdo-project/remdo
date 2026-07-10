import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Link, useLoaderData, useLocation, useNavigate } from 'react-router-dom';
import { authClient, rememberAuthenticatedSession } from '#client/app/auth/client';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { isOAuthAuthorizeSearch } from './oauth-authorize-search';
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
  // The public-auth loader returns { publicServer } for unauthenticated visitors.
  const loaderData = useLoaderData<{ publicServer?: boolean } | null>();
  const publicServer = loaderData?.publicServer ?? false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const completeAuth = async () => {
    rememberAuthenticatedSession();
    if (isOAuthAuthorizeSearch(location.search)) {
      globalThis.location.assign(`/api/auth/oauth2/authorize${location.search}`);
      return;
    }
    const returnTo = await resolvePostAuthPath(location.search, globalThis.location.origin);
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
    <CenteredCardPage description="Sign in to access your documents." title="Sign in">
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

      {!publicServer && (
        <Text c="dimmed" size="sm">
          Setting up this server?{' '}
          <Anchor component={Link} to={`/admin${location.search}`}>
            Become admin
          </Anchor>
          .
        </Text>
      )}
    </CenteredCardPage>
  );
}
