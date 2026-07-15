import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { getTestBridgeRegistry } from '#client/editor/plugins/dev/testBridgeRegistry';
import type { EditorViewBindings } from '#client/editor/view/EditorViewProvider';
import { ensureCollabTestDocument } from './documents';
import { TestEditorView } from './test-editor-view';

/**
 * Renders the RemDo editor for tests and resolves its remdoTest bridge.
 * Registers for the next bridge before rendering so concurrent editors (collab
 * peers) each resolve to their own bridge, then waits for collaboration ready.
 */
export async function renderRemdoEditor(
  docId: string,
  viewProps: EditorViewBindings = {}
): Promise<{
  api: RemdoTestApi;
  unmount: () => void;
}> {
  await ensureCollabTestDocument(docId);

  // Register before rendering so this render captures the bridge its own editor
  // mounts, not one from a previously or concurrently rendered editor.
  const bridgeReady = getTestBridgeRegistry().waitForNext();

  const { unmount } = render(
    <MantineProvider>
      <TestEditorView docId={docId} viewProps={viewProps} />
    </MantineProvider>
  );

  const api = await bridgeReady;
  await api._bridge.waitForCollaborationReady();
  return { api, unmount };
}
