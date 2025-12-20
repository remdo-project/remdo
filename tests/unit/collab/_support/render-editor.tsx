import { MantineProvider } from '@mantine/core';
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

  let api: RemdoTestApi | null = null;

  render(
    <MantineProvider>
      <Editor collabOrigin={origin} docId={docId} onTestBridgeReady={(value) => { api = value as RemdoTestApi; }} />
    </MantineProvider>
  );

  const resolved = await waitFor(() => {
    if (!api) {
      throw new Error('remdoTest API not ready');
    }
    return api;
  });

  await resolved._bridge.waitForCollaborationReady();
  return resolved;
}

export type RenderRemdoEditor = typeof renderRemdoEditor;
