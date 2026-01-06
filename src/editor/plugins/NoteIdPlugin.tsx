import { $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { BaseSelection, LexicalNode } from 'lexical';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
} from 'lexical';
import { useEffect, useRef } from 'react';
import { mergeRegister } from '@lexical/utils';
import { createNoteId, createNoteIdAvoiding } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import {
  findNearestListItem,
  getContentListItem,
  insertBefore,
  isChildrenWrapper,
  flattenNoteNodes,
} from '@/editor/outline/list-structure';
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

interface CutMarker {
  headKeys: string[];
  markedKeys: Set<string>;
}

function $ensureNoteId(item: ListItemNode) {
  if (isChildrenWrapper(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createNoteId());
}

function $collectMarkedKeysFromHeadKeys(headKeys: string[]): Set<string> {
  const marked = new Set<string>();
  if (headKeys.length === 0) {
    return marked;
  }

  for (const key of headKeys) {
    const node = $getNodeByKey<ListItemNode>(key);
    if (!$isListItemNode(node) || isChildrenWrapper(node) || !node.isAttached()) {
      continue;
    }

    for (const item of getSubtreeItems(node)) {
      marked.add(item.getKey());
    }
  }

  return marked;
}

function $regenerateClipboardNoteIds(nodes: LexicalNode[], reservedIds: Set<string>) {
  const stack = nodes.toReversed();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if ($isListItemNode(node) && !isChildrenWrapper(node)) {
      const next = createNoteIdAvoiding(reservedIds);
      $setState(node, noteIdState, next);
      reservedIds.add(next);
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

  if (nextSibling) {
    insertBefore(nextSibling, insertNodes);
  } else {
    parentList.append(...insertNodes);
  }

  const firstInserted = insertNodes.find((node) => $isListItemNode(node) && !isChildrenWrapper(node));
  if ($isListItemNode(firstInserted)) {
    $selectItemEdge(getContentListItem(firstInserted), 'start');
  }

  for (const head of orderedHeads.toReversed()) {
    removeNoteSubtree(head);
  }

  return true;
}

function $insertNodesAtSelection(
  headKeys: string[],
  selection: BaseSelection | null,
  nodes: LexicalNode[]
): boolean {
  if (nodes.length === 0) {
    return false;
  }

  let orderedHeads: ListItemNode[] = [];
  let parentList: LexicalNode | null = null;
  let nextSibling: ListItemNode | null = null;

  if (headKeys.length > 0) {
    const heads = headKeys
      .map((key) => $getNodeByKey<ListItemNode>(key))
      .filter((node): node is ListItemNode => $isListItemNode(node) && node.isAttached() && !isChildrenWrapper(node));
    if (heads.length === 0) {
      return false;
    }

    orderedHeads = sortHeadsByDocumentOrder(heads);
    const lastHead = orderedHeads.at(-1)!;
    parentList = lastHead.getParent();
    if (!$isListNode(parentList)) {
      return false;
    }
    nextSibling = getNextContentSibling(lastHead);
  } else if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const caretItem = findNearestListItem(selection.anchor.getNode());
    if (!caretItem) {
      return false;
    }
    const contentItem = getContentListItem(caretItem);
    parentList = contentItem.getParent();
    if (!$isListNode(parentList)) {
      return false;
    }
    nextSibling = getNextContentSibling(contentItem);
  } else {
    return false;
  }

  if (nextSibling) {
    insertBefore(nextSibling, nodes);
  } else {
    parentList.append(...nodes);
  }

  const firstInserted = nodes.find((node) => $isListItemNode(node) && !isChildrenWrapper(node));
  if ($isListItemNode(firstInserted)) {
    $selectItemEdge(getContentListItem(firstInserted), 'start');
  }

  if (orderedHeads.length > 0) {
    for (const head of orderedHeads.toReversed()) {
      removeNoteSubtree(head);
    }
  }

  return true;
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);
  const lastPasteSelectionHeadKeysRef = useRef<string[] | null>(null);
  const cutMarkerRef = useRef<CutMarker | null>(null);

  useEffect(() => {
    readyRef.current = true;

    if (hydrated) {
      editor.update(() => {
        $normalizeNoteIdsOnLoad($getRoot(), docId);
      });
    }

    return mergeRegister(
      editor.registerNodeTransform(ListItemNode, (node) => {
        if (!readyRef.current) {
          return;
        }
        if (cutMarkerRef.current?.markedKeys.has(node.getKey())) {
          cutMarkerRef.current = null;
        }
        $ensureNoteId(node);
      }),
      editor.registerCommand(
        COPY_COMMAND,
        () => {
          cutMarkerRef.current = null;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        CUT_COMMAND,
        () => {
          let handled = false;
          editor.getEditorState().read(() => {
            let selectionHeadKeys: string[] = [];
            const outlineSelection = editor.selection.get();
            if (outlineSelection?.kind === 'structural') {
              selectionHeadKeys =
                outlineSelection.headKeys.length > 0 ? outlineSelection.headKeys : outlineSelection.selectedKeys;
            }

            if (selectionHeadKeys.length === 0) {
              const selection = $getSelection();
              if ($isRangeSelection(selection) && !selection.isCollapsed()) {
                const heads = getContiguousSelectionHeads(selection);
                selectionHeadKeys = heads.map((item) => getContentListItem(item).getKey());
              }
            }

            if (selectionHeadKeys.length === 0) {
              cutMarkerRef.current = null;
              return;
            }

            cutMarkerRef.current = {
              headKeys: selectionHeadKeys,
              markedKeys: $collectMarkedKeysFromHeadKeys(selectionHeadKeys),
            };
            handled = true;
          });
          return handled;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
        (payload, dispatchEditor) => {
          if (dispatchEditor !== editor) {
            return false;
          }

          const marker = cutMarkerRef.current;
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

          if (marker) {
            const intersection = selectionHeadKeys.some((key) => marker.markedKeys.has(key));
            if (!intersection) {
              const heads = marker.headKeys
                .map((key) => $getNodeByKey<ListItemNode>(key))
                .filter(
                  (node): node is ListItemNode =>
                    $isListItemNode(node) && node.isAttached() && !isChildrenWrapper(node)
                );
              if (heads.length === marker.headKeys.length) {
                const ordered = sortHeadsByDocumentOrder(heads);
                const nodesToMove = flattenNoteNodes(ordered);
                cutMarkerRef.current = null;
                lastPasteSelectionHeadKeysRef.current = null;
                if ($insertNodesAtSelection(selectionHeadKeys, payload.selection, nodesToMove)) {
                  return true;
                }
              }
            }
            cutMarkerRef.current = null;
          }

          const reservedIds = new Set<string>();
          if (docId.length > 0) {
            reservedIds.add(docId);
          }
          $regenerateClipboardNoteIds(payload.nodes, reservedIds);
          lastPasteSelectionHeadKeysRef.current = null;
          return $replaceStructuralSelectionWithClipboardNodes(selectionHeadKeys, payload.nodes);
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
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
      )
    );
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
