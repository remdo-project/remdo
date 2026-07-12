import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
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
// is not auto-hammered on every render of this gate. Each retry is chained off
// the prior `revalidate()` promise (not the revalidator's `loading -> idle`
// transition, which React 19 can batch away for a fast failure), so it waits for
// the prior to settle — react-router's `revalidate()` aborts any in-flight one —
// and a slow reconnect is not a self-cancelling storm.
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
  const { revalidate } = useRevalidator();
  // Pending backoff timer, and a token for the current reconnect cycle.
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleRef = useRef(0);

  // Abandon any live cycle: bump the token so a still-pending `revalidate().then`
  // chain stops, and cancel a scheduled-but-unfired backoff. Returns the new
  // token identifying the cycle a caller is about to (re)start.
  const abandonCycle = useCallback(() => {
    globalThis.clearTimeout(backoffTimerRef.current);
    return (cycleRef.current += 1);
  }, []);

  // Fire the immediate revalidation for a reconnect signal, then chain a bounded
  // backoff off each settle while this cycle is still live. See the module note.
  const armRetryBudget = useCallback(() => {
    const cycle = abandonCycle();

    const runAttempt = (attempt: number) => {
      void revalidate().then(() => {
        const delay = RECONNECT_RETRY_BACKOFFS_MS[attempt];
        if (cycleRef.current !== cycle || delay === undefined) {
          return;
        }
        backoffTimerRef.current = globalThis.setTimeout(runAttempt, delay, attempt + 1);
      });
    };

    runAttempt(0);
  }, [abandonCycle, revalidate]);

  useEffect(() => {
    globalThis.addEventListener('online', armRetryBudget);
    // Recovery unmounts this component; abandoning the cycle on cleanup cancels
    // any pending backoff so no retry fires afterward.
    return () => {
      globalThis.removeEventListener('online', armRetryBudget);
      abandonCycle();
    };
  }, [abandonCycle, armRetryBudget]);

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
