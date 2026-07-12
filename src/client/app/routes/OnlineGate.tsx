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
// Values are absolute offsets from the reconnect: an immediate attempt (0ms)
// the reconnect warrants, then backed-off retries.
const RECONNECT_RETRY_OFFSETS_MS = [0, 150, 550, 1550];

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
  // A reconnect signal (browser `online` event or the Retry button) bumps
  // `arming`; the effect below then schedules the whole `RECONNECT_RETRY_OFFSETS_MS`
  // sequence at once and cancels any prior pending timers. `arming === 0` means
  // never armed (a bare mount), so nothing is scheduled and a genuinely-down
  // server is not auto-hammered. A successful revalidation flips the session
  // state, unmounts this component, and its cleanup cancels the rest of the
  // sequence, so it stops as soon as the connection recovers.
  const [arming, setArming] = useState(0);

  const armRetryBudget = useCallback(() => {
    setArming((count) => count + 1);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('online', armRetryBudget);
    return () => globalThis.removeEventListener('online', armRetryBudget);
  }, [armRetryBudget]);

  useEffect(() => {
    if (arming === 0) {
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const offset of RECONNECT_RETRY_OFFSETS_MS) {
      const timer = globalThis.setTimeout(() => void revalidate(), offset);
      timers.push(timer);
    }
    return () => timers.forEach((timer) => globalThis.clearTimeout(timer));
  }, [arming, revalidate]);

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
