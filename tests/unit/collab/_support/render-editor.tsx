import { MantineProvider } from '@mantine/core';
import { configure, render, waitFor } from '@testing-library/react';
import Editor from '@/editor/Editor';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { COLLAB_LONG_TIMEOUT_MS } from './timeouts';

configure({ asyncUtilTimeout: COLLAB_LONG_TIMEOUT_MS });

interface RenderEditorOptions {
  docId: string;
}

/**
 * Renders the RemDo editor for tests and resolves the window remdoTest API.
 * Centralizes collab origin resolution and waiting for bridge readiness.
 */
export async function renderRemdoEditor({ docId }: RenderEditorOptions): Promise<{
  api: RemdoTestApi;
  unmount: () => void;
}> {
  let api: RemdoTestApi | null = null;

  const { unmount } = render(
    <MantineProvider>
      <Editor docId={docId} onTestBridgeReady={(value) => { api = value as RemdoTestApi; }} />
    </MantineProvider>
  );

  const resolved = await waitFor(() => {
    if (!api) {
      throw new Error('remdoTest API not ready');
    }
    return api;
  });

  await resolved._bridge.waitForCollaborationReady();
  return { api: resolved, unmount };
}

export type RenderRemdoEditor = typeof renderRemdoEditor;
