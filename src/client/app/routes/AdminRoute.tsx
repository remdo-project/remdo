import { Alert, Button, Container, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router-dom';
import UserDataRuntimeBoundary from '#client/app/UserDataRuntimeBoundary';
import { rememberAuthenticatedSession } from '#client/app/auth/client';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';
import { resetUserData } from '#client/app/documents/user-data';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import type { AdminRouteState } from './admin-route-loader';
import ConnectionUnavailable from './ConnectionUnavailable';

// /admin is public: an authenticated admin gets the panel inside the app shell
// with the live user-data runtime; anyone else gets the standalone enroll form,
// so no runtime/user-data fetch is attempted for a visitor who has no session.
export default function AdminRoute() {
  const state = useLoaderData<AdminRouteState>();

  if (state.kind === 'unavailable') {
    return <ConnectionUnavailable />;
  }

  if (state.kind === 'admin') {
    return (
      <UserDataRuntimeBoundary>
        <Container component="main" size="md" py="xl">
          <Title order={1}>Admin</Title>
        </Container>
      </UserDataRuntimeBoundary>
    );
  }

  return <EnrollForm />;
}

// Enrollment always registers a new admin account (the secret gates it, works
// even with signup disabled). Promoting an existing user is a later, panel-gated
// capability, so this form has a single mode.
function EnrollForm() {
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
      // Enrollment always creates + signs in a NEW account, so the cached
      // bootstrap and the live user-data runtime belong to the previous identity
      // (no session, or a signed-in non-admin who enrolled). Clear the cache and
      // reset the runtime; otherwise a runtime already `ready` from the prior user
      // would keep serving their data — mounting the shell alone does not reload
      // it, since start()/ensureReady() no-op when already ready. The next mount
      // (or getUserData) then loads as the new admin.
      clearCurrentUserBootstrapCache();
      resetUserData();
      // Always land the new admin in the panel. Enrollment creates a new
      // account, so resuming a pre-enrollment target (an OAuth-authorize flow or
      // a `?next=`) could point at stale data or a previous identity's document.
      void navigate('/admin', { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to enroll as admin.');
    } finally {
      setPending(false);
    }
  };

  return (
    <CenteredCardPage
      description="Enter the admin secret, plus a name, email, and password to register an admin account."
      title="Become admin"
    >
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
    </CenteredCardPage>
  );
}
