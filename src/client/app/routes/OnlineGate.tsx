import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import type { SessionGateState } from '#client/app/auth/client';
import CenteredCardPage from '#client/ui/CenteredCardPage';

// The first session fetch after the browser reports `online` can still fail
// transiently while the connection re-establishes (e.g. a reset socket), which
// would otherwise leave the gate stuck on "Connection unavailable" until a
// manual retry. Retry a bounded number of times, backing off, so a clean
// reconnect recovers on its own without hammering a server that is genuinely
// down while `navigator.onLine` reports true.
const RECONNECT_RETRY_DELAYS_MS = [150, 400, 1000];

export default function OnlineGate({
  allowOfflineSession = false,
  children,
}: {
  allowOfflineSession?: boolean;
  children: ReactNode;
}) {
  const { sessionState } = useLoaderData<{ sessionState: SessionGateState }>();
  const unavailable = sessionState.status === 'offline-unavailable'
    || (!allowOfflineSession && sessionState.status === 'offline-remembered');

  return unavailable ? <ConnectionUnavailable /> : children;
}

function ConnectionUnavailable() {
  const { revalidate, state } = useRevalidator();
  const retryAttemptRef = useRef(0);

  // A fresh reconnect attempt (browser `online` event or a manual retry) starts
  // its own retry budget.
  const revalidateWithFreshBudget = useCallback(() => {
    retryAttemptRef.current = 0;
    void revalidate();
  }, [revalidate]);

  useEffect(() => {
    globalThis.addEventListener('online', revalidateWithFreshBudget);
    return () => globalThis.removeEventListener('online', revalidateWithFreshBudget);
  }, [revalidateWithFreshBudget]);

  useEffect(() => {
    // While this component stays mounted the gate is still unavailable, so a
    // revalidation that settled back to `idle` did not recover the session.
    // Retry with backoff as long as the browser reports connectivity and the
    // budget remains; a manual `online` event resets the attempt counter above.
    if (state !== 'idle' || !globalThis.navigator.onLine) {
      return;
    }
    const delay = RECONNECT_RETRY_DELAYS_MS[retryAttemptRef.current];
    if (delay === undefined) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      retryAttemptRef.current += 1;
      void revalidate();
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [revalidate, state]);

  return (
    <CenteredCardPage
      description="The RemDo app server can’t be reached right now."
      title="Connection unavailable"
    >
      <Button onClick={revalidateWithFreshBudget} type="button">
        Retry
      </Button>
    </CenteredCardPage>
  );
}
