import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, RootNode } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { useLayoutEffect, useRef } from 'react';
import { mergeRegister } from '@lexical/utils';
import { useCollaborationStatus } from './collaboration';
import { $normalizeOutlineRoot, $shouldNormalizeOutlineRoot } from '@/editor/outline/normalization';
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

    const scheduleRepair = () => {
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
    };

    const unregisterNormalization = editor.registerNodeTransform(RootNode, (node) => {
      $normalizeOutlineRoot(node, { skipOrphanWrappers: true });
    });
    const unregisterRepair = editor.registerUpdateListener(({ dirtyElements, editorState }) => {
      if (repairingRef.current) return;

      if (dirtyElements.size === 0) {
        return;
      }

      const needsRepair = editorState.read(() => $shouldNormalizeOutlineRoot($getRoot()));
      if (!needsRepair) return;

      scheduleRepair();
    });
    normalizeRootOnce(editor);

    return mergeRegister(unregisterNormalization, unregisterRepair);
  }, [editor, hydrated, docEpoch]);

  return null;
}

function normalizeRootOnce(editor: LexicalEditor) {
  // Run a one-time normalization outside the transform cycle for fresh editors.
  editor.update(() => {
    $normalizeOutlineRoot($getRoot());
  });
}
