import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { createUserDataRuntime } from './stored-user-data';
import { UserDataContext } from './user-data';
import { useUserDataRead } from './use-user-data-read';
import { NoteUnavailableError } from '#note-sdk';
import Home from '#client/app/workspace/Home';
import { SharedDocumentsButton } from '#client/app/shell/SharedDocumentsButton';
import { TestMantineProvider } from '#tests';

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
  const { result, unmount } = renderHook(() => useUserDataRead(data => data.documents.getChildren()), { wrapper: wrapperFor(runtime) });
  const pendingQuery = pendingPath === '/api/documents' ? runtime.documentsQuery : runtime.bootstrapQuery;
  const readyQuery = pendingPath === '/api/documents' ? runtime.bootstrapQuery : runtime.documentsQuery;
  await waitFor(() => expect(client.getQueryState(readyQuery.queryKey)?.status).toBe('success'));
  expect(result.current.loading).toBe(true);
  expect(result.current.data).toEqual(pendingPath === '/api/documents' ? undefined : []);
  act(() => release());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual([]);

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

it('returns unavailable data and a readable error, then recovers through retry', async () => {
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
  const { result, unmount } = renderHook(
    () => useUserDataRead(data => data.documents.getChildren().map(note => note.getText())),
    { wrapper: wrapperFor(runtime) },
  );
  // The status reports a message the alert can render, not the raw error.
  await waitFor(() => { expect(result.current.error).toBe('Request failed: 503'); });
  expect(result.current.data).toBeUndefined();
  expect(() => runtime.userData.documents.getChildren()).toThrow(NoteUnavailableError);
  unavailable = false;
  act(() => { result.current.retry(); });
  await waitFor(() => { expect(result.current.data).toEqual(['Home']); });
  expect(result.current.error).toBeNull();
  unmount();
  runtime.dispose();
});

it('keeps Home usable while a source document list is unavailable and retries the failed listing', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  let release!: (response: Response) => void;
  let listing = new Promise<Response>(resolve => { release = resolve; });
  vi.stubGlobal('fetch', vi.fn((request: Request) => new URL(request.url).pathname === '/api/current-user'
    ? Promise.resolve(Response.json({ userId: 'alice' }))
    : listing));
  const Wrapper = wrapperFor(runtime);
  const view = render(<Wrapper><TestMantineProvider><MemoryRouter><Home /></MemoryRouter></TestMantineProvider></Wrapper>);

  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Current Server' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => release(new Response(null, { status: 503 })));
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed: 503');

  listing = Promise.resolve(Response.json([{ id: 'research', title: 'Research', shareable: false }]));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Research' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Current Server' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  view.unmount();
  runtime.dispose();
});

it('keeps cached source documents visible through a Home refresh failure and retries with current names', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  let unavailable = false;
  let title = 'Research';
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname === '/api/current-user') return Response.json({ userId: 'alice' });
    return unavailable
      ? new Response(null, { status: 503 })
      : Response.json([{ id: 'research', title, shareable: false }]);
  }));
  const Wrapper = wrapperFor(runtime);
  const view = render(<Wrapper><TestMantineProvider><MemoryRouter><Home /></MemoryRouter></TestMantineProvider></Wrapper>);
  onTestFinished(() => { view.unmount(); runtime.dispose(); });
  expect(await screen.findByRole('button', { name: 'Research' })).toBeInTheDocument();

  unavailable = true;
  await act(async () => { await client.refetchQueries({ queryKey: runtime.documentsQuery.queryKey }); });
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed: 503');
  expect(screen.getByRole('button', { name: 'Research' })).toBeInTheDocument();

  unavailable = false;
  title = 'Recovered research';
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: title })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('updates successful reads, retains cached data through a refresh error, and recovers', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  let title = 'Draft';
  let unavailable = false;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname === '/api/current-user') return Response.json({ userId: 'alice' });
    return unavailable
      ? new Response(null, { status: 503 })
      : Response.json([{ id: 'draft', title, shareable: false }]);
  }));
  const { result, unmount } = renderHook(
    () => useUserDataRead(data => data.documents.getChildren().map(note => note.getText())),
    { wrapper: wrapperFor(runtime) },
  );
  onTestFinished(() => { unmount(); runtime.dispose(); });
  await waitFor(() => expect(result.current.data).toEqual(['Draft']));

  title = 'Renamed';
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.data).toEqual(['Renamed']));
  expect(result.current.error).toBeNull();

  unavailable = true;
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toBe('Request failed: 503'));
  expect(result.current.data).toEqual(['Renamed']);
  expect(result.current.loading).toBe(false);

  unavailable = false;
  title = 'Recovered';
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.data).toEqual(['Recovered']));
  expect(result.current.error).toBeNull();
});

it('propagates unexpected SDK read failures', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => Response.json(
    new URL(request.url).pathname === '/api/current-user' ? { userId: 'alice' } : [],
  )));
  onTestFinished(() => runtime.dispose());
  const failure = new Error('Unexpected SDK read failure');

  expect(() => renderHook(() => useUserDataRead(() => { throw failure; }), {
    wrapper: wrapperFor(runtime),
  })).toThrow(failure);
});

it('reads the received-document list only while the sharing panel is open', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createUserDataRuntime('alice', client);
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => Response.json(
    new URL(request.url).pathname === '/api/current-user'
      ? { userId: 'alice' }
      : [{ id: 'received', title: 'Shared notes', shareable: false }],
  )));
  const readChildren = vi.spyOn(runtime.userData.documents, 'getChildren');
  const host = document.createElement('span');
  document.body.append(host);
  const Wrapper = wrapperFor(runtime);
  const view = render(
    <Wrapper><TestMantineProvider><MemoryRouter><SharedDocumentsButton host={host} /></MemoryRouter></TestMantineProvider></Wrapper>,
  );
  onTestFinished(() => { view.unmount(); host.remove(); runtime.dispose(); });

  expect(readChildren).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Shared with you' }));
  expect(await screen.findByRole('link', { name: /Shared notes/u })).toHaveAttribute('href', '/n/received');
});
