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

  const result = render(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>,
  );

  return { loaderCalls, result };
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

    await act(async () => {
      globalThis.dispatchEvent(new Event('online'));
    });
    // Drain the reconnect revalidation plus the backoff retry ladder.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('signed-in-shell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connection unavailable' })).toBeNull();
    // At least one retry beyond the failed reconnect revalidation was required.
    expect(loaderCalls.count).toBeGreaterThanOrEqual(3);
  });

  it('stops retrying while the browser reports offline', async () => {
    setOnline(false);
    const { loaderCalls } = renderOnlineGate(Number.POSITIVE_INFINITY);

    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument(),
    );
    const callsAfterMount = loaderCalls.count;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // No `online` event fired and navigator is offline, so nothing revalidates.
    expect(loaderCalls.count).toBe(callsAfterMount);
    expect(screen.getByRole('heading', { name: 'Connection unavailable' })).toBeInTheDocument();
  });
});
