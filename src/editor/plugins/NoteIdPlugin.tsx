import { $isListItemNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor, LexicalNode } from 'lexical';
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $setState,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_COMMAND,
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

function $collectClipboardNoteIds(nodes: LexicalNode[]): string[] {
  if (nodes.length === 0) {
    return [];
  }

  const ordered: string[] = [];
  const stack = nodes.toReversed();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if ($isListItemNode(node) && !isChildrenWrapper(node)) {
      const noteId = $getNoteId(node);
      if (noteId) {
        ordered.push(noteId);
      }
    }

    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (let i = children.length - 1; i >= 0; i -= 1) {
        const child = children[i];
        if (child) {
          stack.push(child);
        }
      }
    }
  }

  return ordered;
}

function $getStructuralSelectionNoteIds(editor: LexicalEditor): string[] {
  const outlineSelection = editor.selection.get();
  if (!outlineSelection || outlineSelection.kind !== 'structural') {
    return [];
  }

  const ordered: string[] = [];
  for (const key of outlineSelection.selectedKeys) {
    const node = $getNodeByKey(key);
    if ($isListItemNode(node) && !isChildrenWrapper(node)) {
      const noteId = $getNoteId(node);
      if (noteId) {
        ordered.push(noteId);
      }
    }
  }

  return ordered;
}

function noteIdListsMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);
  const lastCutNoteIdsRef = useRef<string[] | null>(null);

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

        const clipboardNoteIds = $collectClipboardNoteIds(payload.nodes);
        if (clipboardNoteIds.length === 0) {
          lastCutNoteIdsRef.current = null;
          return false;
        }

        const selectionNoteIds = $getStructuralSelectionNoteIds(editor);
        if (selectionNoteIds.length > 0 && noteIdListsMatch(selectionNoteIds, clipboardNoteIds)) {
          lastCutNoteIdsRef.current = null;
          return true;
        }

        const cutNoteIds = lastCutNoteIdsRef.current;
        if (cutNoteIds && noteIdListsMatch(cutNoteIds, clipboardNoteIds)) {
          lastCutNoteIdsRef.current = null;
          return false;
        }

        $stripNoteIdsFromClipboardNodes(payload.nodes);
        lastCutNoteIdsRef.current = null;
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterCut = editor.registerCommand(
      CUT_COMMAND,
      () => {
        const selectionNoteIds = $getStructuralSelectionNoteIds(editor);
        lastCutNoteIdsRef.current = selectionNoteIds.length > 0 ? selectionNoteIds : null;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterCopy = editor.registerCommand(
      COPY_COMMAND,
      () => {
        lastCutNoteIdsRef.current = null;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      unregisterTransform();
      unregisterClipboard();
      unregisterCut();
      unregisterCopy();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
