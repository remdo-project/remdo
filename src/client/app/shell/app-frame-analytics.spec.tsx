import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ANALYTICS_CONSENT_GRANTED_EVENT } from '#platform/analytics';
import { apiConfiguration } from '#platform/http/api-client';
import { writeStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';
import { TestMantineProvider } from '#tests';
import type { SessionGateState } from '#client/app/session/client';
import AppFrame from './AppFrame';

let track: Mock<(event: string) => void>;
let identify: Mock<(id: string) => void>;

function renderFrame(signedInState: SessionGateState = { status: 'offline-remembered' }) {
  for (const slot of ['header-links', 'footer-status']) {
    const element = document.createElement('div');
    element.dataset.slot = slot;
    document.body.append(element);
  }
  apiConfiguration.client.setQueryData(apiConfiguration.query.queryKey, {
    buildRevision: '',
    csrfCookieName: 'csrf',
    csrfToken: '',
    errorReportingDsn: '',
  });
  const router = createMemoryRouter([
    {
      path: '/',
      element: <AppFrame />,
      hydrateFallbackElement: <div aria-hidden="true" />,
      children: [
        { index: true, loader: () => ({ sessionState: signedInState }), element: <p>signed in</p> },
        { path: 'signed-out', loader: () => ({ sessionState: { status: 'unauthenticated' } }), element: <p>signed out</p> },
      ],
    },
  ]);
  render(
    <TestMantineProvider>
      <RouterProvider router={router} />
    </TestMantineProvider>,
  );
  return router;
}

beforeEach(() => {
  writeStoredCurrentUserBootstrap(JSON.stringify({ userId: '42' }));
  track = vi.fn<(event: string) => void>();
  identify = vi.fn<(id: string) => void>();
  window.remdoAnalyticsAllowed = true;
  window.umami = { identify, track };
});

afterEach(() => {
  document.body.replaceChildren();
  delete window.remdoAnalyticsAllowed;
  delete window.remdoAnalyticsSuspended;
  delete window.umami;
  localStorage.clear();
});

describe('app frame analytics', () => {
  it('identifies the signed-in user and reports the app opening', async () => {
    renderFrame();

    await waitFor(() => expect(track).toHaveBeenCalledExactlyOnceWith('app-opened'));
    expect(identify).toHaveBeenCalledExactlyOnceWith('42');
  });

  it('identifies an authenticated user by the session user id', async () => {
    renderFrame({ status: 'authenticated', session: { user: { id: 7 } } } as unknown as SessionGateState);

    await waitFor(() => expect(identify).toHaveBeenCalledExactlyOnceWith('7'));
  });

  it('reports the app opening when consent is granted after it was opened', async () => {
    window.remdoAnalyticsAllowed = false;
    renderFrame();
    await waitFor(() => expect(document.body).toHaveTextContent('signed in'));
    expect(track).not.toHaveBeenCalled();

    window.remdoAnalyticsAllowed = true;
    act(() => {
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_GRANTED_EVENT));
    });

    expect(identify).toHaveBeenCalledExactlyOnceWith('42');
    expect(track).toHaveBeenCalledExactlyOnceWith('app-opened');
  });

  it('stops sending after sign-out and resumes without a second app opening when signed in again', async () => {
    const router = renderFrame();
    await waitFor(() => expect(track).toHaveBeenCalledOnce());

    await act(() => router.navigate('/signed-out'));
    await waitFor(() => expect(document.body).toHaveTextContent('signed out'));
    expect(window.remdoAnalyticsSuspended).toBe(true);

    await act(() => router.navigate('/'));
    await waitFor(() => expect(window.remdoAnalyticsSuspended).toBe(false));
    expect(identify).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledOnce();
  });
});
