import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import type { SessionGateState } from '#client/app/auth/client';
import CenteredCardPage from '#client/ui/CenteredCardPage';

// The first session fetch after a reconnect (browser `online` event or a manual
// retry) can still fail transiently while the connection re-establishes (e.g. a
// reset socket), which would otherwise leave the gate stuck on "Connection
// unavailable" until another manual retry. Each reconnect signal therefore fires
// an immediate revalidation and then, only if it settles still-unavailable, a
// bounded set of backed-off retries so a clean reconnect recovers on its own.
// Retries are *only* driven by a reconnect signal — never by a bare mount while
// `navigator.onLine` is true — so a server that is genuinely down (network up)
// is not auto-hammered on every render of this gate. Each retry waits for the
// prior revalidation to settle before scheduling (react-router's `revalidate()`
// aborts any in-flight one), so a slow reconnect is not a self-cancelling storm.
const RECONNECT_RETRY_BACKOFFS_MS = [150, 400, 1000];

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
  // A reconnect signal (browser `online` event or the Retry button) bumps
  // `arming`, which fires an immediate revalidation and opens a fresh retry
  // budget. `arming === 0` means never armed (a bare mount), so a genuinely-down
  // server is not auto-hammered. `retriesLeftRef` is the remaining backoff
  // budget for the current cycle; each backoff retry is scheduled only once the
  // prior revalidation has settled (see the state-driven effect below).
  const [arming, setArming] = useState(0);
  // Index of the next backoff retry into `RECONNECT_RETRY_BACKOFFS_MS`; the cycle
  // ends once it reaches the array length.
  const nextBackoffRef = useRef(0);
  // Set true while a revalidation this cycle is in flight, so a backoff is only
  // scheduled on the `loading -> idle` settle edge — never off the `idle` the
  // immediate revalidation starts from (which would race a retry against the
  // in-flight fetch and abort it).
  const revalidationPendingRef = useRef(false);

  const armRetryBudget = useCallback(() => {
    nextBackoffRef.current = 0;
    setArming((count) => count + 1);
  }, []);

  useEffect(() => {
    globalThis.addEventListener('online', armRetryBudget);
    return () => globalThis.removeEventListener('online', armRetryBudget);
  }, [armRetryBudget]);

  // Fire the immediate revalidation for each reconnect signal.
  useEffect(() => {
    if (arming === 0) {
      return;
    }
    revalidationPendingRef.current = true;
    void revalidate();
  }, [arming, revalidate]);

  // On the `loading -> idle` settle edge, with this component still mounted
  // (i.e. still unavailable), spend one unit of the retry budget on a backed-off
  // follow-up. Waiting for the settle — rather than a wall-clock offset — means
  // each retry follows the prior instead of aborting it; recovery unmounts this
  // component so no further retry fires.
  useEffect(() => {
    if (state === 'loading') {
      revalidationPendingRef.current = true;
      return;
    }
    if (!revalidationPendingRef.current || nextBackoffRef.current >= RECONNECT_RETRY_BACKOFFS_MS.length) {
      return;
    }
    revalidationPendingRef.current = false;
    const delay = RECONNECT_RETRY_BACKOFFS_MS[nextBackoffRef.current];
    const timer = globalThis.setTimeout(() => {
      nextBackoffRef.current += 1;
      revalidationPendingRef.current = true;
      void revalidate();
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [revalidate, state]);

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
