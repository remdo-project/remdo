import { $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalNode } from 'lexical';
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
} from 'lexical';
import { useEffect, useRef } from 'react';
import { createNoteId, createNoteIdAvoiding } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { getContentListItem, insertBefore, isChildrenWrapper } from '@/editor/outline/list-structure';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import {
  getNextContentSibling,
  getSubtreeItems,
  removeNoteSubtree,
  sortHeadsByDocumentOrder,
} from '@/editor/outline/selection/tree';
import { useCollaborationStatus } from './collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';

function $ensureNoteId(item: ListItemNode) {
  if (isChildrenWrapper(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createNoteId());
}

function $collectDocumentNoteIds(docId: string, excludedKeys?: Set<string>): Set<string> {
  const root = $getRoot();
  const reserved = new Set<string>();
  const stack = root.getChildren().toReversed();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (
      $isListItemNode(node) &&
      !isChildrenWrapper(node) &&
      (!excludedKeys || !excludedKeys.has(node.getKey()))
    ) {
      const noteId = $getNoteId(node);
      if (noteId) {
        reserved.add(noteId);
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

  if (docId.length > 0) {
    reserved.add(docId);
  }
  return reserved;
}

function $collectExcludedKeysFromHeadKeys(headKeys: string[]): Set<string> {
  const excluded = new Set<string>();
  if (headKeys.length === 0) {
    return excluded;
  }

  for (const key of headKeys) {
    const node = $getNodeByKey<ListItemNode>(key);
    if (!$isListItemNode(node) || isChildrenWrapper(node) || !node.isAttached()) {
      continue;
    }

    for (const item of getSubtreeItems(node)) {
      excluded.add(item.getKey());
    }
  }

  return excluded;
}

function $preserveClipboardNoteIds(nodes: LexicalNode[], reservedIds: Set<string>) {
  const stack = nodes.toReversed();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if ($isListItemNode(node) && !isChildrenWrapper(node)) {
      const existing = $getNoteId(node);
      if (!existing || reservedIds.has(existing)) {
        const next = createNoteIdAvoiding(reservedIds);
        $setState(node, noteIdState, next);
        reservedIds.add(next);
      } else {
        reservedIds.add(existing);
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
}

function $extractClipboardListChildren(nodes: LexicalNode[]): LexicalNode[] {
  const extracted: LexicalNode[] = [];

  for (const node of nodes) {
    if ($isListNode(node)) {
      extracted.push(...node.getChildren());
    } else if ($isListItemNode(node)) {
      extracted.push(node);
    }
  }

  return extracted;
}

function $replaceStructuralSelectionWithClipboardNodes(headKeys: string[], nodes: LexicalNode[]): boolean {
  if (headKeys.length === 0) {
    return false;
  }

  const heads = headKeys
    .map((key) => $getNodeByKey<ListItemNode>(key))
    .filter((node): node is ListItemNode => $isListItemNode(node) && node.isAttached() && !isChildrenWrapper(node));
  if (heads.length === 0) {
    return false;
  }

  const insertNodes = $extractClipboardListChildren(nodes);
  if (insertNodes.length === 0) {
    return false;
  }

  const orderedHeads = sortHeadsByDocumentOrder(heads);
  const lastHead = orderedHeads.at(-1)!;
  const parentList = lastHead.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const nextSibling = getNextContentSibling(lastHead);
  for (const head of orderedHeads.toReversed()) {
    removeNoteSubtree(head);
  }

  if (nextSibling) {
    insertBefore(nextSibling, insertNodes);
  } else {
    parentList.append(...insertNodes);
  }

  const firstInserted = insertNodes.find((node) => $isListItemNode(node) && !isChildrenWrapper(node));
  if ($isListItemNode(firstInserted)) {
    $selectItemEdge(getContentListItem(firstInserted), 'start');
  }

  return true;
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);
  const lastPasteSelectionHeadKeysRef = useRef<string[] | null>(null);

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

        let selectionHeadKeys = lastPasteSelectionHeadKeysRef.current ?? [];
        if (selectionHeadKeys.length === 0) {
          const outlineSelection = editor.selection.get();
          if (outlineSelection?.kind === 'structural') {
            selectionHeadKeys =
              outlineSelection.headKeys.length > 0 ? outlineSelection.headKeys : outlineSelection.selectedKeys;
          }
        }
        if (selectionHeadKeys.length === 0 && $isRangeSelection(payload.selection)) {
          const selection = payload.selection;
          if (!selection.isCollapsed()) {
            const heads = getContiguousSelectionHeads(selection);
            selectionHeadKeys = heads.map((item) => getContentListItem(item).getKey());
          }
        }
        const excludedKeys = $collectExcludedKeysFromHeadKeys(selectionHeadKeys);
        const reservedIds = $collectDocumentNoteIds(docId, excludedKeys);
        $preserveClipboardNoteIds(payload.nodes, reservedIds);
        lastPasteSelectionHeadKeysRef.current = null;
        return $replaceStructuralSelectionWithClipboardNodes(selectionHeadKeys, payload.nodes);
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      () => {
        const outlineSelection = editor.selection.get();
        lastPasteSelectionHeadKeysRef.current =
          outlineSelection?.kind === 'structural' && outlineSelection.headKeys.length > 0
            ? [...outlineSelection.headKeys]
            : outlineSelection?.kind === 'structural' && outlineSelection.selectedKeys.length > 0
              ? [...outlineSelection.selectedKeys]
            : null;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      unregisterTransform();
      unregisterClipboard();
      unregisterPaste();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
