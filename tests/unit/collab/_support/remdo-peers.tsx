import { config } from '#config';
import { render, waitFor } from '@testing-library/react';
import { env } from 'node:process';
import Editor from '@/editor/Editor';
import type { RemdoTestApi } from '@/editor/plugins/dev';

let peerCounter = 0;

function setDocQueryParam(docId: string) {
  const href = globalThis.location.href;
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  params.set('doc', docId);
  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
  globalThis.history.replaceState(null, '', nextUrl);
}

export async function renderCollabEditor(options?: { docId?: string }): Promise<RemdoTestApi> {
  const workerId = env.VITEST_WORKER_ID || '0';
  const docId =
    (options && options.docId) ||
    config.env.COLLAB_DOCUMENT_ID ||
    `collab-peer-${workerId}-${peerCounter++}`;
  setDocQueryParam(docId);

  const { protocol, hostname } = globalThis.location;
  const collabOrigin = `${protocol}//${hostname}:${config.env.COLLAB_CLIENT_PORT}`;

  render(<Editor collabOrigin={collabOrigin} />);

  const api = await waitFor(() => {
    const candidate = (globalThis as typeof globalThis & { remdoTest?: RemdoTestApi }).remdoTest;
    if (!candidate) {
      throw new Error('remdoTest API not ready');
    }
    return candidate;
  });

  // Setup-time only: ensure collaboration is hydrated before handing to tests.
  await api._bridge.waitForCollaborationReady();
  return {
    ...api,
    // allow setup callers to reach bridge while preserving lint ban in tests
    _bridge: api._bridge,
  };
}
