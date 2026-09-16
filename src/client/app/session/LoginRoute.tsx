import { Alert, Button } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { createSignInPath } from './post-auth-path';
import { LOGGED_OUT_STATE_KEY } from './useLogout';

export default function LoginRoute() {
  const location = useLocation();
  const signedOut = (location.state as Record<string, unknown> | null)?.[LOGGED_OUT_STATE_KEY] === true;
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (signedOut) titleRef.current?.focus();
  }, [signedOut]);

  return (
    <CenteredCardPage description="Sign in to access your documents." title="Sign in" titleRef={signedOut ? titleRef : undefined}>
      {signedOut && (
        <Alert color="blue" role="status" title="You're signed out">
          This device's local data was cleared.
        </Alert>
      )}
      <Button className="remdo-account-button" component="a" href={createSignInPath(location.search)}>Sign in</Button>
    </CenteredCardPage>
  );
}
