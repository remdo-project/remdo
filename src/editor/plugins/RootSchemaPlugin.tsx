import type { LexicalEditor } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, RootNode } from 'lexical';
import { ListItemNode, ListNode } from '@lexical/list';
import { useLayoutEffect, useRef } from 'react';
import { mergeRegister } from '@lexical/utils';
import { useCollaborationStatus } from './collaboration';
import {
  $normalizeOutlineList,
  $normalizeOutlineListItem,
  $normalizeOutlineRoot,
  $shouldNormalizeOutlineRoot,
} from '@/editor/outline/normalization';
import { markSchemaValidationSkipOnce } from './dev/schema/schemaValidationSkipOnce';

export function RootSchemaPlugin() {
  const [editor] = useLexicalComposerContext();
  // `hydrated` is true once the current document finishes its initial collab load
  // (or immediately when collab is disabled). `docEpoch` increments whenever a
  // new document/provider starts loading so we can tear down/re-arm cleanly.
  const { hydrated, docEpoch } = useCollaborationStatus();
  const repairingRef = useRef(false);
  const repairScheduledRef = useRef(false);

  /**
   * Root schema lifecycle contract:
   * 1) If collaboration is disabled, normalize immediately.
   * 2) If collaboration is enabled but the current document has not hydrated yet,
   *    stay idle—do not attempt to repair the schema before collab data arrives.
   * 3) Once the current document hydrates, keep enforcing the schema even if the
   *    provider later disconnects.
   * 4) When a new document starts loading (provider replaced/destroyed), pause
   *    again until that document finishes hydrating.
   */
  useLayoutEffect(() => {
    if (!hydrated) {
      return;
    }

    const unregisterNormalization = editor.registerNodeTransform(RootNode, (node) => {
      $normalizeOutlineRoot(node);
    });
    const unregisterListItemNormalization = editor.registerNodeTransform(ListItemNode, (node) => {
      $normalizeOutlineListItem(node);
    });
    const unregisterListNormalization = editor.registerNodeTransform(ListNode, (node) => {
      $normalizeOutlineList(node);
    });
    const unregisterRepair = editor.registerUpdateListener(({ editorState }) => {
      if (repairingRef.current) return;

      const needsRepair = editorState.read(() => $shouldNormalizeOutlineRoot($getRoot()));
      if (!needsRepair) return;

      if (repairScheduledRef.current) return;

      repairScheduledRef.current = true;
      markSchemaValidationSkipOnce(editor);
      queueMicrotask(() => {
        repairingRef.current = true;
        editor.update(() => {
          $normalizeOutlineRoot($getRoot());
        });
        repairingRef.current = false;
        repairScheduledRef.current = false;
      });
    });
    normalizeRootOnce(editor);

    return mergeRegister(
      unregisterNormalization,
      unregisterListItemNormalization,
      unregisterListNormalization,
      unregisterRepair
    );
  }, [editor, hydrated, docEpoch]);

  return null;
}

function normalizeRootOnce(editor: LexicalEditor) {
  // Run a one-time normalization outside the transform cycle for fresh editors.
  editor.update(() => {
    $normalizeOutlineRoot($getRoot());
  });
}
