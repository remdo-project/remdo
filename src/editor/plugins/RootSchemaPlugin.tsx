import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getRoot, RootNode } from 'lexical';
import type { EditorState, LexicalEditor, NodeKey } from 'lexical';
import { $isListNode } from '@lexical/list';
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

      const isFullReconcile = dirtyElements.size === 1 && dirtyElements.has('root');
      if (isFullReconcile) {
        const needsRepair = editorState.read(() => $shouldNormalizeOutlineRoot($getRoot()));
        if (!needsRepair) return;
        scheduleRepair();
        return;
      }

      const dirtyListKeys = collectDirtyListKeys(dirtyElements, editorState);
      if (dirtyListKeys.size === 0) {
        return;
      }

      const needsRepair = editorState.read(() => $shouldNormalizeOutlineRoot($getRoot(), dirtyListKeys));
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

function collectDirtyListKeys(dirtyElements: ReadonlyMap<NodeKey, boolean>, editorState: EditorState): Set<NodeKey> {
  if (dirtyElements.size === 0) {
    return new Set();
  }

  const listKeys = new Set<NodeKey>();

  const addListKeys = (state: typeof editorState) => {
    state.read(() => {
      for (const [key] of dirtyElements) {
        const node = $getNodeByKey(key);
        if (!node) continue;

        if ($isListNode(node)) {
          listKeys.add(node.getKey());
          continue;
        }

        let current = node.getParent();
        while (current && !$isListNode(current)) {
          current = current.getParent();
        }

        if ($isListNode(current)) {
          listKeys.add(current.getKey());
        }
      }
    });
  };

  addListKeys(editorState);

  return listKeys;
}
