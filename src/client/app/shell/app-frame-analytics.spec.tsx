import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { apiConfiguration } from '#platform/http/api-client';
import type { SessionGateState } from '#client/app/session/client';
import { writeStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';
import { TestMantineProvider } from '#tests';
import AppFrame from './AppFrame';

let track: Mock<(event: string) => void>;
let identify: Mock<(id: string) => void>;

const authenticated: SessionGateState = {
  status: 'authenticated',
  session: { user: { id: 7, display: 'User', has_usable_password: true, is_staff: false }, methods: [] },
};

function renderFrame(signedInState: SessionGateState) {
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
  track = vi.fn<(event: string) => void>();
  identify = vi.fn<(id: string) => void>();
  window.umami = { identify, track };
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  delete window.umami;
  delete window.remdoAnalyticsDisabled;
  delete window.remdoAnalyticsUserId;
});

describe('app frame analytics', () => {
  it('reports the app opening for an authenticated user, identified by their account', async () => {
    renderFrame(authenticated);

    await waitFor(() => expect(track).toHaveBeenCalledExactlyOnceWith('app-opened'));
    expect(identify).toHaveBeenCalledExactlyOnceWith('7');
    expect(identify.mock.invocationCallOrder[0]).toBeLessThan(track.mock.invocationCallOrder[0]!);
  });

  it('identifies a remembered offline session by the cached account', async () => {
    writeStoredCurrentUserBootstrap(JSON.stringify({ userId: '42' }));

    renderFrame({ status: 'offline-remembered' });

    await waitFor(() => expect(identify).toHaveBeenCalledExactlyOnceWith('42'));
    expect(track).toHaveBeenCalledExactlyOnceWith('app-opened');
  });

  it('does not identify anyone while statistics are turned off', async () => {
    window.remdoAnalyticsDisabled = true;

    renderFrame(authenticated);

    await waitFor(() => expect(track).toHaveBeenCalledOnce());
    expect(identify).not.toHaveBeenCalled();
  });

  it('ends the identity and does not count another app opening once the user signs out', async () => {
    const router = renderFrame(authenticated);
    await waitFor(() => expect(track).toHaveBeenCalledOnce());
    track.mockClear();

    await act(() => router.navigate('/signed-out'));
    await waitFor(() => expect(document.body).toHaveTextContent('signed out'));

    expect(window.remdoAnalyticsUserId).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('counts the app opening once per page load however often the session returns', async () => {
    const router = renderFrame(authenticated);
    await waitFor(() => expect(track).toHaveBeenCalledOnce());

    await act(() => router.navigate('/signed-out'));
    await waitFor(() => expect(document.body).toHaveTextContent('signed out'));
    await act(() => router.navigate('/'));
    await waitFor(() => expect(document.body).toHaveTextContent('signed in'));

    expect(track).toHaveBeenCalledOnce();
  });
});
