import { MantineProvider } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import OnlineGate from '#client/app/routes/OnlineGate';
import type { SessionGateState } from '#client/app/auth/client';

function setOnline(online: boolean) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

/**
 * Renders OnlineGate against a loader that returns `offline-unavailable` until
 * `failuresBeforeRecovery` revalidations have run, then returns
 * `unauthenticated` (a state that renders children). Returns the loader call
 * count so tests can assert how many retries were needed.
 */
function renderOnlineGate(failuresBeforeRecovery: number) {
  const loaderCalls = { count: 0 };
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => {
          loaderCalls.count += 1;
          const status: SessionGateState['status'] =
            loaderCalls.count > failuresBeforeRecovery ? 'unauthenticated' : 'offline-unavailable';
          return { sessionState: { status } };
        },
        element: (
          <OnlineGate>
            <div>signed-in-shell</div>
          </OnlineGate>
        ),
        hydrateFallbackElement: <div aria-hidden="true" />,
      },
    ],
    { initialEntries: ['/'] },
  );

  render(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>,
  );

  return { loaderCalls };
}

/**
 * Fires a reconnect (`online`) signal, then drains every timer the reconnect
 * scheduled. The gate schedules its whole backoff sequence up front, so a single
 * `runAllTimersAsync` covers it regardless of the ladder's delays.
 */
async function fireReconnectAndDrainLadder() {
  await act(async () => {
    globalThis.dispatchEvent(new Event('online'));
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('online gate reconnect revalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  it('recovers after a transient revalidation failure once connectivity returns', async () => {
    // The initial load and the first reconnect revalidation both land
    // offline-unavailable; only a backed-off retry finds the session again.
    const { loaderCalls } = renderOnlineGate(2);

    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument(),
    );
    expect(loaderCalls.count).toBe(1);

    await fireReconnectAndDrainLadder();

    expect(screen.getByText('signed-in-shell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connection unavailable' })).toBeNull();
    // At least one retry beyond the failed reconnect revalidation was required.
    expect(loaderCalls.count).toBeGreaterThanOrEqual(3);
  });

  it('does not retry on a bare mount while the server is down but the network is up', async () => {
    // navigator.onLine is true (set in beforeEach) but the server never
    // recovers. Without a reconnect signal the gate must not auto-hammer it:
    // exactly the single loader call from mount, no backoff retries.
    const { loaderCalls } = renderOnlineGate(Number.POSITIVE_INFINITY);

    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument(),
    );
    expect(loaderCalls.count).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(loaderCalls.count).toBe(1);
    expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument();
  });

  it('bounds the reconnect retry budget when the server stays unavailable', async () => {
    // A reconnect signal fires against a server that never recovers. The ladder
    // must retry a bounded number of times and then stop, not loop forever.
    const { loaderCalls } = renderOnlineGate(Number.POSITIVE_INFINITY);

    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument(),
    );
    expect(loaderCalls.count).toBe(1);

    // A reconnect fires a bounded sequence of revalidations, then stops.
    await fireReconnectAndDrainLadder();
    const callsAfterFirstReconnect = loaderCalls.count;
    // The sequence ran (more than the single mount call) but stayed finite.
    expect(callsAfterFirstReconnect).toBeGreaterThan(1);

    // Budget spent: more time passes with no additional revalidations — the
    // contract is boundedness, not the exact ladder length.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loaderCalls.count).toBe(callsAfterFirstReconnect);
    expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument();

    // A fresh reconnect signal re-arms the sequence for another bounded round.
    await fireReconnectAndDrainLadder();
    expect(loaderCalls.count).toBeGreaterThan(callsAfterFirstReconnect);

    // The second round is also bounded — no runaway growth.
    const callsAfterSecondReconnect = loaderCalls.count;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loaderCalls.count).toBe(callsAfterSecondReconnect);
  });
});
