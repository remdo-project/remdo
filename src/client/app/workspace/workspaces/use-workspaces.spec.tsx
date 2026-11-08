import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';
import { NOTES_QUERY_KEY } from '#client/app/user-data/stored-user-data';
import type { NoteRead } from './notes-api';
import { useWorkspaces } from './use-workspaces';

let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });


function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function serveAccount() {
  const fetch = vi.fn(async () => Response.json({
    ref: 'me', kind: 'account', text: 'a@example.test', operations: ['read', 'insert'],
    children: [{
      ref: 'w1', kind: 'workspace', text: 'Trip', operations: ['read', 'delete', 'setText'], version: 'v',
      children: [{ ref: 'w1/README.md', kind: 'document', text: 'README', operations: ['read', 'setContent'], version: null }],
    }],
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

it('lists the account workspaces when the current user can use them', async () => {
  writeStoredCurrentUserBootstrap(JSON.stringify({ userId: 'alice', canUseWorkspaces: true }));
  serveAccount();

  const { result } = renderHook(useWorkspaces, { wrapper });

  await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
  const [workspace] = result.current.workspaces;
  expect([workspace!.getText(), workspace!.documentRef]).toEqual(['Trip', 'w1/README.md']);
});

it('reads no notes for a user without workspace access', async () => {
  writeStoredCurrentUserBootstrap(JSON.stringify({ userId: 'alice', canUseWorkspaces: false }));
  const fetch = serveAccount();

  const { result } = renderHook(useWorkspaces, { wrapper });

  expect(result.current).toMatchObject({ workspaces: [], enabled: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetch).not.toHaveBeenCalled();
});

it('resolves a change once the listed workspaces reflect it', async () => {
  writeStoredCurrentUserBootstrap(JSON.stringify({ userId: 'alice', canUseWorkspaces: true }));
  let name = 'Trip';
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/config') return Response.json({ csrfCookieName: 'csrftoken' });
    if (request.method === 'POST') {
      name = 'Lisbon';
      return Response.json({ results: [{ ref: 'w1' }], changes: [], revision: null, dryRun: false });
    }
    // The change's own notice rereads while the change confirms the list.
    if (++reads === 2) await client.cancelQueries({ queryKey: NOTES_QUERY_KEY });
    return Response.json({
      ref: 'me', kind: 'account', text: 'a@example.test', operations: ['read', 'insert'],
      children: [{
        ref: 'w1', kind: 'workspace', text: name, operations: ['read', 'delete', 'setText'], version: 'v',
        children: [{ ref: 'w1/README.md', kind: 'document', text: 'README', operations: ['read'], version: null }],
      }],
    });
  }));
  const { result } = renderHook(useWorkspaces, { wrapper });
  await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

  await act(() => result.current.workspaces[0]!.rename('Lisbon'));

  expect(client.getQueryData<NoteRead>([...NOTES_QUERY_KEY, 'me'])?.children?.[0]?.text).toBe('Lisbon');
});
