import { $isListItemNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalNode } from 'lexical';
import {
  $getRoot,
  $isElementNode,
  $setState,
  COMMAND_PRIORITY_LOW,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
} from 'lexical';
import { useEffect, useRef } from 'react';
import { createNoteId } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from './collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';

function $ensureNoteId(item: ListItemNode) {
  if (isChildrenWrapper(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createNoteId());
}

function $stripNoteIdsFromClipboardNodes(nodes: LexicalNode[]) {
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if ($isListItemNode(node) && !isChildrenWrapper(node)) {
      $setState(node, noteIdState, noteIdState.parse(null));
    }

    if ($isElementNode(node)) {
      stack.push(...node.getChildren());
    }
  }
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = true;

    if (hydrated) {
      editor.update(() => {
        $normalizeNoteIdsOnLoad($getRoot(), docId);
      });
    }

    const unregisterTransform = editor.registerNodeTransform(ListItemNode, (node) => {
      if (!readyRef.current) {
        return;
      }
      $ensureNoteId(node);
    });

    const unregisterClipboard = editor.registerCommand(
      SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
      (payload, dispatchEditor) => {
        if (dispatchEditor !== editor) {
          return false;
        }
        $stripNoteIdsFromClipboardNodes(payload.nodes);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterTransform();
      unregisterClipboard();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
