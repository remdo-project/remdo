import { Alert, Button } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useRevalidator } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { createSignInPath } from './post-auth-path';
import { LOGGED_OUT_STATE_KEY } from './useLogout';
import { CONFIRMED_SIGN_OUT_KEY, PENDING_SIGN_OUT_STORAGE_KEY, hasConfirmedSignOut, hasPendingSignOut, revokeServerSession } from './client';

export default function LoginRoute() {
  const location = useLocation();
  const { revalidate } = useRevalidator();

  const [finishing, setFinishing] = useState(false);
  const pending = hasPendingSignOut() && !hasConfirmedSignOut();

  useEffect(() => {
    const refreshSignOutState = (event: StorageEvent) => {
      if (event.key === PENDING_SIGN_OUT_STORAGE_KEY || event.key === CONFIRMED_SIGN_OUT_KEY) {
        void revalidate();
      }
    };
    globalThis.addEventListener('storage', refreshSignOutState);
    return () => globalThis.removeEventListener('storage', refreshSignOutState);
  }, [revalidate]);

  const finishSignOut = async () => {
    setFinishing(true);
    try {
      await revokeServerSession();
      await revalidate();
    } finally {
      setFinishing(false);
    }
  };
  const signedOut = (location.state as Record<string, unknown> | null)?.[LOGGED_OUT_STATE_KEY] === true;
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (signedOut) titleRef.current?.focus();
  }, [signedOut]);

  return (
    <CenteredCardPage description="Sign in to access your documents." title="Sign in" titleRef={signedOut ? titleRef : undefined}>
      {pending ? (
        <Alert color="yellow" role="status" title="Sign-out incomplete">
          Local data cleared. Connect to finish signing out.
        </Alert>
      ) : (signedOut || hasConfirmedSignOut()) && (
        <Alert color="blue" role="status" title="You're signed out">
          This device's local data was cleared.
        </Alert>
      )}
      {pending && <Button loading={finishing} onClick={() => { void finishSignOut(); }}>Finish signing out</Button>}
      <Button className="remdo-account-button" component="a" href={createSignInPath(location.search)}>Sign in</Button>
    </CenteredCardPage>
  );
}
