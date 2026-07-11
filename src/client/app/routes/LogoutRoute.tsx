import { Alert, Button } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { logoutCurrentUser } from '#client/app/auth/logout';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { clearLocalLogoutData } from './logout-local-data';

type LogoutStatus = 'clearing-local' | 'local-failed' | 'server-failed' | 'signing-out';

export default function LogoutRoute() {
  const [status, setStatus] = useState<LogoutStatus>('clearing-local');

  const runLogout = useCallback(async () => {
    setStatus('clearing-local');
    try {
      await clearLocalLogoutData();
    } catch {
      // Do not sign out server-side while private local Yjs data remains on this device.
      setStatus('local-failed');
      return;
    }

    setStatus('signing-out');
    const result = await logoutCurrentUser();
    if (result.serverSignedOut) {
      globalThis.location.assign('/');
      return;
    }
    setStatus('server-failed');
  }, []);

  useEffect(() => {
    void runLogout();
  }, [runLogout]);

  const isFailed = status === 'local-failed' || status === 'server-failed';
  const message = status === 'local-failed'
    ? 'Close other RemDo tabs, then retry.'
    : status === 'server-failed'
      ? 'Server sign-out failed. Retry when online.'
      : status === 'clearing-local'
        ? 'Clearing local data.'
        : 'Signing out.';

  return (
    <CenteredCardPage description={message} title="Logging out">
      {isFailed && (
        <>
          <Alert color="yellow" title="Logout paused">
            {message}
          </Alert>
          <Button onClick={() => void runLogout()}>
            Retry logout
          </Button>
        </>
      )}
    </CenteredCardPage>
  );
}
