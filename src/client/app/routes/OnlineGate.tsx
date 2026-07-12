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
// starts a bounded, backed-off sequence of revalidations so a clean reconnect
// recovers on its own. The sequence is *only* driven by a reconnect signal —
// never by a bare mount while `navigator.onLine` is true — so a server that is
// genuinely down (network up) is not auto-hammered on every render of this gate.
// The leading 0ms attempt is the immediate revalidation the reconnect warrants;
// the rest are the backed-off retries.
const RECONNECT_RETRY_DELAYS_MS = [0, 150, 400, 1000];

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
  // A reconnect signal arms the sequence; the effect below schedules each
  // attempt off `RECONNECT_RETRY_DELAYS_MS[attempt]` and advances the index,
  // stopping once it runs past the ladder. `attempt: null` means never armed
  // (a bare mount). `arming` is a monotonic token so a repeated reconnect
  // always re-arms — even when `attempt` is already 0, whose bare value React
  // would dedupe. State (not a ref) so each advance re-renders and re-runs the
  // effect deterministically.
  const [retryState, setRetryState] = useState<{ arming: number; attempt: number | null }>({
    arming: 0,
    attempt: null,
  });

  const armRetryBudget = useCallback(() => {
    setRetryState((prev) => ({ arming: prev.arming + 1, attempt: 0 }));
  }, []);

  useEffect(() => {
    globalThis.addEventListener('online', armRetryBudget);
    return () => globalThis.removeEventListener('online', armRetryBudget);
  }, [armRetryBudget]);

  const { arming, attempt } = retryState;
  useEffect(() => {
    // Only run while a reconnect signal has armed the sequence. This component
    // staying mounted means the prior revalidation left the gate unavailable, so
    // schedule the next attempt. Once the index runs past the ladder the budget
    // is spent: schedule nothing and wait for the next reconnect signal.
    if (attempt === null) {
      return;
    }
    const delay = RECONNECT_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      void revalidate();
      setRetryState((prev) => ({ ...prev, attempt: attempt + 1 }));
    }, delay);
    return () => globalThis.clearTimeout(timer);
    // `arming` is a dep so a re-arm to the same `attempt` (0) still re-runs.
  }, [arming, attempt, revalidate]);

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
