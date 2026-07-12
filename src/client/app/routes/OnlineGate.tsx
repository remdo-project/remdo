import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import type { SessionGateState } from '#client/app/auth/client';
import CenteredCardPage from '#client/ui/CenteredCardPage';

// The first session fetch after a reconnect (browser `online` event or a manual
// retry) can still fail transiently while the connection re-establishes (e.g. a
// reset socket), which would otherwise leave the gate stuck on "Connection
// unavailable" until another manual retry. Each reconnect signal therefore
// starts a bounded, backed-off retry budget so a clean reconnect recovers on its
// own. Retries are *only* driven by a reconnect signal — never by a bare mount
// while `navigator.onLine` is true — so a server that is genuinely down (network
// up) is not auto-hammered on every render of this gate.
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
  const { revalidate } = useRevalidator();
  // A reconnect signal arms the retry budget by setting the next attempt index
  // to 0; the backoff effect below schedules each attempt and advances the
  // index, stopping once it runs past the ladder. `null` means never armed
  // (a bare mount). Attempt state (not a ref) so each advance re-renders and
  // re-runs the effect deterministically, and a repeated reconnect re-arms by
  // resetting to 0.
  const [retryAttempt, setRetryAttempt] = useState<number | null>(null);

  const armRetryBudget = useCallback(() => {
    setRetryAttempt(0);
    void revalidate();
  }, [revalidate]);

  useEffect(() => {
    globalThis.addEventListener('online', armRetryBudget);
    return () => globalThis.removeEventListener('online', armRetryBudget);
  }, [armRetryBudget]);

  useEffect(() => {
    // Only retry while a reconnect signal has armed the budget. This component
    // staying mounted means the prior revalidation left the gate unavailable, so
    // schedule the next backed-off attempt. Once the attempt index runs past the
    // ladder the budget is spent: schedule nothing and wait for the next
    // reconnect signal or manual retry to re-arm (reset the index to 0).
    if (retryAttempt === null) {
      return;
    }
    const delay = RECONNECT_RETRY_DELAYS_MS[retryAttempt];
    if (delay === undefined) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      setRetryAttempt(retryAttempt + 1);
      void revalidate();
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [retryAttempt, revalidate]);

  return (
    <CenteredCardPage
      description="The RemDo app server can’t be reached right now."
      title="Connection unavailable"
    >
      <Button onClick={armRetryBudget} type="button">
        Retry
      </Button>
    </CenteredCardPage>
  );
}
