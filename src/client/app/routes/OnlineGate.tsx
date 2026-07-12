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
  const { revalidate } = useRevalidator();
  // The backoff timer for the pending retry, and a token identifying the current
  // reconnect cycle. A new reconnect signal bumps the token so any still-pending
  // chain from a prior cycle is abandoned, and unmount stops the chain entirely
  // (recovery unmounts this component). Chaining off the `revalidate()` promise —
  // rather than observing the revalidator's `loading -> idle` transition — means
  // a fast-failing revalidation whose state React batches away still advances the
  // ladder.
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleRef = useRef(0);

  // A reconnect signal (browser `online` event or the Retry button) fires an
  // immediate revalidation and, each time it settles still-unavailable, a
  // bounded set of backed-off retries. Each retry waits for the prior
  // revalidation to settle (react-router's `revalidate()` aborts any in-flight
  // one), so a slow reconnect is not a self-cancelling storm. Nothing else calls
  // `revalidate()`, so a bare mount of a genuinely-down server is never
  // auto-hammered — the "only on a reconnect signal" guarantee is structural.
  const armRetryBudget = useCallback(() => {
    const cycle = (cycleRef.current += 1);
    globalThis.clearTimeout(backoffTimerRef.current);

    // Revalidate; once it settles still-unavailable (this component is still
    // mounted) schedule the next backed-off attempt, until the budget runs out.
    // A newer reconnect or unmount bumps `cycleRef`, abandoning this chain.
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
  }, [revalidate]);

  useEffect(() => {
    globalThis.addEventListener('online', armRetryBudget);
    return () => globalThis.removeEventListener('online', armRetryBudget);
  }, [armRetryBudget]);

  // On unmount (recovery flips the session state and unmounts this component),
  // invalidate the current cycle and cancel any pending backoff so no retry
  // fires afterward.
  useEffect(() => () => {
    cycleRef.current += 1;
    globalThis.clearTimeout(backoffTimerRef.current);
  }, []);

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
