import { render, waitFor } from '@testing-library/react';
import { config } from '#config';
import Editor from '@/editor/Editor';
import type { RemdoTestApi } from '@/editor/plugins/dev';

interface RenderEditorOptions {
  docId: string;
  collabOrigin?: string;
}

/**
 * Renders the RemDo editor for tests and resolves the window remdoTest API.
 * Centralizes collab origin resolution and waiting for bridge readiness.
 */
export async function renderRemdoEditor({ docId, collabOrigin }: RenderEditorOptions): Promise<RemdoTestApi> {
  const origin =
    collabOrigin
    || `${globalThis.location.protocol}//${globalThis.location.hostname}:${config.env.COLLAB_CLIENT_PORT}`;

  render(<Editor collabOrigin={origin} docId={docId} />);

  const api = await waitFor(() => {
    const candidate = (globalThis as typeof globalThis & { remdoTest?: RemdoTestApi }).remdoTest;
    if (!candidate) {
      throw new Error('remdoTest API not ready');
    }
    return candidate;
  });

  await api._bridge.waitForCollaborationReady();
  return api;
}

export type RenderRemdoEditor = typeof renderRemdoEditor;
