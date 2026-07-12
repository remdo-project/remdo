import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import OnlineGate from '#client/app/routes/OnlineGate';
import type { SessionGateState } from '#client/app/auth/client';

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
        // Async so the revalidator observably transitions idle -> loading ->
        // idle on each revalidation, as it does against the real session fetch.
        loader: async () => {
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
 * Fires a reconnect (`online`) signal, then drains the full retry sequence. The
 * gate schedules each backoff only after the prior revalidation settles, so
 * `runAllTimersAsync` keeps running the timers it re-schedules until the budget
 * is spent (or recovery unmounts the gate).
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
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('recovers when the user clicks Retry (no online event)', async () => {
    // No `online` event fires; the manual Retry button is the only recovery
    // path (per the bounded-retry tradeoff). Clicking it must arm the same
    // revalidation cycle and recover.
    const { loaderCalls } = renderOnlineGate(2);

    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument(),
    );
    expect(loaderCalls.count).toBe(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('signed-in-shell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connection unavailable' })).toBeNull();
  });

  it('fires no backoff retry when the immediate reconnect attempt recovers', async () => {
    // failuresBeforeRecovery=1: mount fails, the immediate revalidation the
    // reconnect fires succeeds. No backoff retry may be scheduled or fired —
    // recovery unmounts the gate before the settle effect spends any budget.
    const { loaderCalls } = renderOnlineGate(1);

    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument(),
    );
    expect(loaderCalls.count).toBe(1);

    await fireReconnectAndDrainLadder();

    expect(screen.getByText('signed-in-shell')).toBeInTheDocument();
    // Mount (1) + the single immediate reconnect revalidation (2), nothing more.
    const callsAfterRecovery = loaderCalls.count;
    expect(callsAfterRecovery).toBe(2);

    // Confirm no stray retry fires after the backoff window would have elapsed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loaderCalls.count).toBe(callsAfterRecovery);
  });

  it('does not retry on a bare mount without a reconnect signal', async () => {
    // No `online` event or Retry click is ever dispatched, so the gate is never
    // armed. Even though the server never recovers, it must not auto-hammer it:
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
