import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createUserDataRuntime } from './stored-user-data';
import { UserDataContext, useUserData, useUserDataStatus } from './user-data';

vi.mock('#client/app/session/client', () => ({
  hasRememberedSession: () => false,
  isLikelyFetchUnavailableError: (error: unknown) => error instanceof TypeError,
}));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

function wrapperFor(runtime: ReturnType<typeof createUserDataRuntime>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={runtime.client}>
        <UserDataContext value={runtime}>{children}</UserDataContext>
      </QueryClientProvider>
    );
  };
}

it.each(['/api/current-user', '/api/documents'])('waits for %s on initial load without treating a later refresh as initial loading', async (pendingPath) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  let release!: () => void;
  let held = new Promise<void>(resolve => { release = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === pendingPath) await held;
    return Response.json(path === '/api/current-user' ? { userId: 'alice' } : []);
  }));
  const { result, unmount } = renderHook(useUserDataStatus, { wrapper: wrapperFor(runtime) });
  const pendingQuery = pendingPath === '/api/documents' ? runtime.documentsQuery : runtime.bootstrapQuery;
  const readyQuery = pendingPath === '/api/documents' ? runtime.bootstrapQuery : runtime.documentsQuery;
  await waitFor(() => expect(client.getQueryState(readyQuery.queryKey)?.status).toBe('success'));
  expect(result.current.loading).toBe(true);
  act(() => release());
  await waitFor(() => expect(result.current.loading).toBe(false));

  held = new Promise<void>(resolve => { release = resolve; });
  act(() => result.current.retry());
  await waitFor(() => expect(client.getQueryState(pendingQuery.queryKey)?.fetchStatus).toBe('fetching'));
  expect(result.current.loading).toBe(false);
  act(() => release());
  await waitFor(() => expect(client.getQueryState(pendingQuery.queryKey)?.fetchStatus).toBe('idle'));
  expect(result.current.error).toBeNull();
  unmount();
  runtime.dispose();
});

it('reactively shows metadata errors and recovers through the Home retry action', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  let unavailable = true;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname === '/api/current-user') {
      return Response.json({ userId: 'alice' });
    }
    return unavailable
      ? new Response(null, { status: 503 })
      : Response.json([{ id: 'aliceHome', title: 'Home', shareable: false }]);
  }));
  const { result, unmount } = renderHook(() => {
    const data = useUserData();
    return { titles: data.getDocuments().getChildren().map((document) => document.getText()), status: useUserDataStatus() };
  }, { wrapper: wrapperFor(runtime) });
  // The status reports a message the alert can render, not the raw error.
  await waitFor(() => { expect(result.current.status.error).toBe('Request failed: 503'); });
  expect(result.current.titles).toEqual([]);
  unavailable = false;
  act(() => { result.current.status.retry(); });
  await waitFor(() => { expect(result.current.titles).toEqual(['Home']); });
  expect(result.current.status.error).toBeNull();
  unmount();
  runtime.dispose();
});
