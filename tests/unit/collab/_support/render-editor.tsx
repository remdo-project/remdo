import { MantineProvider } from '@mantine/core';
import { render, waitFor } from '@testing-library/react';
import Editor from '@/editor/Editor';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { EditorViewProvider } from '@/editor/view/EditorViewProvider';
import type { EditorViewBindings } from '@/editor/view/EditorViewProvider';

/**
 * Renders the RemDo editor for tests and resolves the window remdoTest API.
 * Centralizes collab origin resolution and waiting for bridge readiness.
 */
export async function renderRemdoEditor(
  docId: string,
  viewProps: EditorViewBindings = {}
): Promise<{
  api: RemdoTestApi;
  unmount: () => void;
}> {
  let api: RemdoTestApi | null = null;

  const { unmount } = render(
    <MantineProvider>
      <EditorViewProvider docId={docId} {...viewProps}>
        <Editor
          docId={docId}
          statusPortalRoot={null}
          onTestBridgeReady={(value) => {
            api = value as RemdoTestApi;
          }}
        />
      </EditorViewProvider>
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
