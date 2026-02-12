import { MantineProvider } from '@mantine/core';
import { configure, render, waitFor } from '@testing-library/react';
import Editor from '@/editor/Editor';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { COLLAB_LONG_TIMEOUT_MS } from './timeouts';
import type { ComponentProps } from 'react';

configure({ asyncUtilTimeout: COLLAB_LONG_TIMEOUT_MS });

interface RenderEditorOptions {
  docId: string;
  editorProps?: Partial<Omit<ComponentProps<typeof Editor>, 'docId'>>;
}

/**
 * Renders the RemDo editor for tests and resolves the window remdoTest API.
 * Centralizes collab origin resolution and waiting for bridge readiness.
 */
export async function renderRemdoEditor({ docId, editorProps }: RenderEditorOptions): Promise<{
  api: RemdoTestApi;
  unmount: () => void;
}> {
  const { statusPortalRoot, ...resolvedEditorProps } = editorProps ?? {};
  let api: RemdoTestApi | null = null;

  const { unmount } = render(
    <MantineProvider>
      <Editor
        {...resolvedEditorProps}
        docId={docId}
        statusPortalRoot={statusPortalRoot ?? null}
        onTestBridgeReady={(value) => { api = value as RemdoTestApi; }}
      />
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
