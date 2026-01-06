import { $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { BaseSelection, EditorState, LexicalNode, SerializedEditorState, SerializedLexicalNode } from 'lexical';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setState,
  TextNode,
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

interface ClipboardPayload {
  namespace: string;
  nodes: SerializedLexicalNode[];
  remdoCut?: boolean;
}

function getClipboardNamespace(editor: { _config?: { namespace?: string } }): string {
  return editor._config?.namespace ?? 'remdo';
}

function isClipboardEvent(event: ClipboardEvent | KeyboardEvent | InputEvent | null): event is ClipboardEvent {
  return !!event && 'clipboardData' in event;
}

function getClipboardPayload(event: ClipboardEvent | KeyboardEvent | InputEvent | null): ClipboardPayload | null {
  if (!isClipboardEvent(event) || !event.clipboardData) {
    return null;
  }
  const raw = event.clipboardData.getData('application/x-lexical-editor');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ClipboardPayload;
  } catch {
    return null;
  }
}

function $getContentKeyFromNode(node: LexicalNode | null): string | null {
  if (!node) {
    return null;
  }
  const listItem = findNearestListItem(node);
  if (!listItem) {
    return null;
  }
  return getContentListItem(listItem).getKey();
}

function $getContentKeyFromNodeKey(key: string): string | null {
  return $getContentKeyFromNode($getNodeByKey(key));
}

function isCaretWithinMarkedSelection(marker: CutMarker, selection: BaseSelection | null): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const caretItem = findNearestListItem(selection.anchor.getNode());
  if (!caretItem) {
    return false;
  }

  const contentItem = getContentListItem(caretItem);
  return marker.markedKeys.has(contentItem.getKey());
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

function $serializeClipboardNodesFromHeads(heads: ListItemNode[]): SerializedLexicalNode[] {
  if (heads.length === 0) {
    return [];
  }

  const orderedHeads = sortHeadsByDocumentOrder(heads);
  const flattened = flattenNoteNodes(orderedHeads);
  const serialized = flattened.map((node) => node.exportJSON());

  const parentList = orderedHeads[0]?.getParent();
  if ($isListNode(parentList) && orderedHeads.every((head) => head.getParent() === parentList)) {
    const listNode = parentList.exportJSON();
    listNode.children = serialized;
    return [listNode];
  }

  return serialized;
}

function getSerializedChildren(node: SerializedLexicalNode): SerializedLexicalNode[] {
  const children = (node as { children?: SerializedLexicalNode[] }).children;
  return Array.isArray(children) ? children : [];
}

function findSerializedListItem(root: SerializedLexicalNode, noteId: string): SerializedLexicalNode | null {
  if (root.type === 'listitem' && (root as { noteId?: unknown }).noteId === noteId) {
    return root;
  }

  for (const child of getSerializedChildren(root)) {
    const found = findSerializedListItem(child, noteId);
    if (found) {
      return found;
    }
  }

  return null;
}

function $hydrateClipboardContentNodes(nodes: SerializedLexicalNode[], state: SerializedEditorState): void {
  const root = state.root;

  const walk = (node: SerializedLexicalNode) => {
    if (node.type === 'listitem') {
      const noteId = (node as { noteId?: unknown }).noteId;
      const children = getSerializedChildren(node);
      if (typeof noteId === 'string' && children.length === 0) {
        const source = findSerializedListItem(root, noteId);
        if (source) {
          const sourceChildren = getSerializedChildren(source);
          if (sourceChildren.length > 0) {
            (node as { children?: SerializedLexicalNode[] }).children = sourceChildren;
          }
        }
      }
    }

    for (const child of getSerializedChildren(node)) {
      walk(child);
    }
  };

  for (const node of nodes) {
    walk(node);
  }
}

function $buildPlainTextFromHeads(heads: ListItemNode[]): string {
  if (heads.length === 0) {
    return '';
  }

  const orderedHeads = sortHeadsByDocumentOrder(heads);
  const lines: string[] = [];

  for (const head of orderedHeads) {
    for (const item of getSubtreeItems(head)) {
      lines.push(item.getTextContent());
    }
  }

  return lines.join('\n');
}

function $populateClipboardFromHeads(
  editor: { _config?: { namespace?: string }; getEditorState: () => EditorState },
  heads: ListItemNode[],
  event: ClipboardEvent | KeyboardEvent | null
): void {
  if (heads.length === 0 || !isClipboardEvent(event) || !event.clipboardData) {
    return;
  }

  const nodes = $serializeClipboardNodesFromHeads(heads);
  if (nodes.length === 0) {
    return;
  }

  $hydrateClipboardContentNodes(nodes, editor.getEditorState().toJSON());

  const payload: ClipboardPayload = {
    namespace: getClipboardNamespace(editor),
    nodes,
    remdoCut: true,
  };

  event.preventDefault();
  event.clipboardData.setData('application/x-lexical-editor', JSON.stringify(payload));
  event.clipboardData.setData('text/plain', $buildPlainTextFromHeads(heads));
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
  const lastPasteWasCutRef = useRef(false);

  useEffect(() => {
    readyRef.current = true;

    if (hydrated) {
      editor.update(() => {
        $normalizeNoteIdsOnLoad($getRoot(), docId);
      });
    }

    return mergeRegister(
      editor.registerMutationListener(
        ListItemNode,
        (mutations, payload) => {
          const marker = cutMarkerRef.current;
          if (!marker) {
            return;
          }

          for (const key of mutations.keys()) {
            const currentKey = editor.getEditorState().read(() => $getContentKeyFromNodeKey(key));
            if (currentKey && marker.markedKeys.has(currentKey)) {
              cutMarkerRef.current = null;
              return;
            }
            const prevKey = payload.prevEditorState.read(() => $getContentKeyFromNodeKey(key));
            if (prevKey && marker.markedKeys.has(prevKey)) {
              cutMarkerRef.current = null;
              return;
            }
          }
        },
        { skipInitialization: true }
      ),
      editor.registerMutationListener(
        TextNode,
        (mutations, payload) => {
          const marker = cutMarkerRef.current;
          if (!marker) {
            return;
          }

          for (const key of mutations.keys()) {
            const currentKey = editor.getEditorState().read(() => $getContentKeyFromNodeKey(key));
            if (currentKey && marker.markedKeys.has(currentKey)) {
              cutMarkerRef.current = null;
              return;
            }
            const prevKey = payload.prevEditorState.read(() => $getContentKeyFromNodeKey(key));
            if (prevKey && marker.markedKeys.has(prevKey)) {
              cutMarkerRef.current = null;
              return;
            }
          }
        },
        { skipInitialization: true }
      ),
      editor.registerNodeTransform(ListItemNode, (node) => {
        if (!readyRef.current) {
          return;
        }
        $ensureNoteId(node);
      }),
      editor.registerCommand(
        COPY_COMMAND,
        () => {
          cutMarkerRef.current = null;
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CUT_COMMAND,
        (event) => {
          let handled = false;
          editor.getEditorState().read(() => {
            cutMarkerRef.current = null;

            let selectionHeadKeys: string[] = [];
            let isStructuralCut = false;

            const outlineSelection = editor.selection.get();
            if (outlineSelection?.kind === 'structural') {
              selectionHeadKeys =
                outlineSelection.headKeys.length > 0 ? outlineSelection.headKeys : outlineSelection.selectedKeys;
              isStructuralCut = selectionHeadKeys.length > 0;
            } else {
              const selection = $getSelection();
              if ($isRangeSelection(selection) && !selection.isCollapsed()) {
                const heads = getContiguousSelectionHeads(selection);
                if (heads.length > 1) {
                  selectionHeadKeys = heads.map((item) => getContentListItem(item).getKey());
                  isStructuralCut = true;
                }
              }
            }

            if (!isStructuralCut || selectionHeadKeys.length === 0) {
              return;
            }

            const heads = selectionHeadKeys
              .map((key) => $getNodeByKey<ListItemNode>(key))
              .filter(
                (node): node is ListItemNode =>
                  $isListItemNode(node) && node.isAttached() && !isChildrenWrapper(node)
              );
            if (heads.length === 0) {
              return;
            }

            cutMarkerRef.current = {
              headKeys: selectionHeadKeys,
              markedKeys: $collectMarkedKeysFromHeadKeys(selectionHeadKeys),
            };
            $populateClipboardFromHeads(editor, heads, event);
            handled = true;
          });
          return handled;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
        (payload, dispatchEditor) => {
          if (dispatchEditor !== editor) {
            return false;
          }

          const wasCutPaste = lastPasteWasCutRef.current;
          lastPasteWasCutRef.current = false;
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

          if (wasCutPaste) {
            if (!marker) {
              lastPasteSelectionHeadKeysRef.current = null;
              return true;
            }

            const caretInMarked =
              selectionHeadKeys.length === 0 && isCaretWithinMarkedSelection(marker, payload.selection);
            const intersection = caretInMarked || selectionHeadKeys.some((key) => marker.markedKeys.has(key));
            if (intersection) {
              lastPasteSelectionHeadKeysRef.current = null;
              return true;
            }

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

            cutMarkerRef.current = null;
            lastPasteSelectionHeadKeysRef.current = null;
            return true;
          }

          const reservedIds = new Set<string>();
          if (docId.length > 0) {
            reservedIds.add(docId);
          }
          $regenerateClipboardNoteIds(payload.nodes, reservedIds);
          const insertNodes = $extractClipboardListChildren(payload.nodes);
          lastPasteSelectionHeadKeysRef.current = null;
          return $insertNodesAtSelection(selectionHeadKeys, payload.selection, insertNodes);
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const outlineSelection = editor.selection.get();
          lastPasteSelectionHeadKeysRef.current =
            outlineSelection?.kind === 'structural' && outlineSelection.headKeys.length > 0
              ? [...outlineSelection.headKeys]
              : outlineSelection?.kind === 'structural' && outlineSelection.selectedKeys.length > 0
                ? [...outlineSelection.selectedKeys]
                : null;
          const clipboardPayload = getClipboardPayload(event);
          lastPasteWasCutRef.current = clipboardPayload?.remdoCut === true;
          if (!lastPasteWasCutRef.current) {
            cutMarkerRef.current = null;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
