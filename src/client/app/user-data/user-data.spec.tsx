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

it('reactively shows metadata errors and recovers through the Home retry action', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  let unavailable = true;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname === '/api/current-user') {
      return Response.json({ userId: 'alice', publicServer: false });
    }
    return unavailable
      ? new Response(null, { status: 503 })
      : Response.json([{ id: 'aliceHome', title: 'Home', shareable: false }]);
  }));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <UserDataContext value={runtime}>{children}</UserDataContext>
      </QueryClientProvider>
    );
  }
  const { result, unmount } = renderHook(() => {
    const data = useUserData();
    return { titles: data.getDocuments().getChildren().map((document) => document.getText()), status: useUserDataStatus() };
  }, { wrapper: Wrapper });
  await waitFor(() => { expect(result.current.status.error?.message).toBe('Request failed: 503'); });
  expect(result.current.titles).toEqual([]);
  unavailable = false;
  act(() => { result.current.status.retry(); });
  await waitFor(() => { expect(result.current.titles).toEqual(['Home']); });
  expect(result.current.status.error).toBeNull();
  unmount();
  runtime.dispose();
});
