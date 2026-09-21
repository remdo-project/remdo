import { Alert, Button } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useRevalidator } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { createSignInPath } from './post-auth-path';
import { LOGGED_OUT_STATE_KEY } from './useLogout';
import { CONFIRMED_SIGN_OUT_KEY, PENDING_SIGN_OUT_STORAGE_KEY, hasConfirmedSignOut, hasPendingSignOut, revokeServerSession } from './client';

export default function LoginRoute() {
  const location = useLocation();
  const { revalidate } = useRevalidator();

  const [signingIn, setSigningIn] = useState(false);
  const [revokeFailed, setRevokeFailed] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const pending = hasPendingSignOut() && !hasConfirmedSignOut();
  const signInPath = createSignInPath(location.search);

  useEffect(() => {
    const refreshSignOutState = (event: StorageEvent) => {
      if (event.key === PENDING_SIGN_OUT_STORAGE_KEY || event.key === CONFIRMED_SIGN_OUT_KEY) {
        void revalidate();
      }
    };
    globalThis.addEventListener('storage', refreshSignOutState);
    // Confirmation can arrive between rendering and installing the listener.
    void revalidate();
    return () => globalThis.removeEventListener('storage', refreshSignOutState);
  }, [revalidate]);

  useEffect(() => {
    const syncOnline = () => {
      setOnline(navigator.onLine);
      setRevokeFailed(false);
    };
    globalThis.addEventListener('online', syncOnline);
    globalThis.addEventListener('offline', syncOnline);
    return () => {
      globalThis.removeEventListener('online', syncOnline);
      globalThis.removeEventListener('offline', syncOnline);
    };
  }, []);

  // An unfinished logout leaves the session cookie valid, and the session gate
  // refuses to contact the server while the marker is set, so the server-rendered
  // form would redirect straight back here. Finish the sign-out the user already
  // asked for, then hand off to it.
  const signIn = useCallback(async () => {
    setSigningIn(true);
    setRevokeFailed(false);
    try {
      if (await revokeServerSession()) {
        // A full document load, not a client route: the credential form is
        // server-rendered by Django.
        globalThis.location.href = signInPath;
        return;
      }
      setRevokeFailed(true);
      await revalidate();
    } finally {
      setSigningIn(false);
    }
  }, [revalidate, signInPath]);

  const signedOut = (location.state as Record<string, unknown> | null)?.[LOGGED_OUT_STATE_KEY] === true;
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (signedOut) titleRef.current?.focus();
  }, [signedOut]);

  return (
    <CenteredCardPage description="Sign in to access your documents." title="Sign in" titleRef={signedOut ? titleRef : undefined}>
      {pending ? (
        <Alert color="yellow" role="status" title="Sign-out incomplete">
          {online
            ? revokeFailed
              ? 'The server could not be reached. Try signing in again.'
              : 'Local data cleared. Signing in finishes signing out first.'
            : 'Local data cleared. Connect to finish signing out.'}
        </Alert>
      ) : (signedOut || hasConfirmedSignOut()) && (
        <Alert color="blue" role="status" title="You're signed out">
          This device's local data was cleared.
        </Alert>
      )}
      {pending ? (
        <Button
          className="remdo-account-button"
          disabled={!online}
          loading={signingIn}
          onClick={() => { void signIn(); }}
          type="button"
        >
          Sign in
        </Button>
      ) : (
        <Button className="remdo-account-button" component="a" href={signInPath}>Sign in</Button>
      )}
    </CenteredCardPage>
  );
}
