import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { writeStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';
import { useWorkspaces } from './use-workspaces';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  const [workspace] = result.current.workspaces!;
  expect([workspace!.getText(), workspace!.documentRef]).toEqual(['Trip', 'w1/README.md']);
});

it('reads no notes for a user without workspace access', async () => {
  writeStoredCurrentUserBootstrap(JSON.stringify({ userId: 'alice', canUseWorkspaces: false }));
  const fetch = serveAccount();

  const { result } = renderHook(useWorkspaces, { wrapper });

  expect(result.current).toMatchObject({ workspaces: null, enabled: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetch).not.toHaveBeenCalled();
});
