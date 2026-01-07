import { $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { BaseSelection, LexicalEditor, LexicalNode, SerializedLexicalNode } from 'lexical';
import { $getHtmlContent, $getLexicalContent, setLexicalClipboardDataTransfer } from '@lexical/clipboard';
import type { LexicalClipboardData } from '@lexical/clipboard';
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
import type { OutlineSelectionRange } from '@/editor/outline/selection/model';
import { computeStructuralRangeFromHeads } from '@/editor/outline/selection/resolve';
import type { StructuralOverlayConfig } from '@/editor/outline/selection/overlay';
import { updateStructuralOverlay } from '@/editor/outline/selection/overlay';
import {
  getNextContentSibling,
  getSubtreeItems,
  removeNoteSubtree,
  sortHeadsByDocumentOrder,
} from '@/editor/outline/selection/tree';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '@/editor/commands';
import { useCollaborationStatus } from './collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';

interface CutMarker {
  headKeys: string[];
  markedKeys: Set<string>;
  range: OutlineSelectionRange;
}

interface ClipboardPayload {
  namespace: string;
  nodes: SerializedLexicalNode[];
  remdoCut?: boolean;
}

const CUT_MARKER_OVERLAY: StructuralOverlayConfig = {
  className: 'editor-input--cut-marker',
  topVar: '--cut-marker-top',
  heightVar: '--cut-marker-height',
};

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

function getCutMarkerRange(heads: ListItemNode[]): OutlineSelectionRange | null {
  if (heads.length === 0) {
    return null;
  }

  const ordered = sortHeadsByDocumentOrder(heads);
  return computeStructuralRangeFromHeads(ordered);
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

function $populateClipboardFromSelection(
  editor: LexicalEditor,
  selection: BaseSelection | null,
  event: ClipboardEvent | KeyboardEvent | null
): boolean {
  if (!isClipboardEvent(event) || !event.clipboardData) {
    return false;
  }

  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return false;
  }

  const data: LexicalClipboardData = {
    'text/plain': selection.getTextContent(),
  };
  const html = $getHtmlContent(editor, selection);
  if (html) {
    data['text/html'] = html;
  }
  const lexical = $getLexicalContent(editor, selection);
  if (!lexical) {
    return false;
  }

  try {
    const payload = JSON.parse(lexical) as ClipboardPayload;
    payload.remdoCut = true;
    data['application/x-lexical-editor'] = JSON.stringify(payload);
  } catch {
    return false;
  }

  event.preventDefault();
  setLexicalClipboardDataTransfer(event.clipboardData, data);
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
  const lastPasteWasCutRef = useRef(false);

  useEffect(() => {
    readyRef.current = true;

    const setCutMarker = (next: CutMarker | null) => {
      cutMarkerRef.current = next;
      updateStructuralOverlay(editor, next?.range ?? null, next !== null, CUT_MARKER_OVERLAY);
    };

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
              setCutMarker(null);
              return;
            }
            const prevKey = payload.prevEditorState.read(() => $getContentKeyFromNodeKey(key));
            if (prevKey && marker.markedKeys.has(prevKey)) {
              setCutMarker(null);
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
              setCutMarker(null);
              return;
            }
            const prevKey = payload.prevEditorState.read(() => $getContentKeyFromNodeKey(key));
            if (prevKey && marker.markedKeys.has(prevKey)) {
              setCutMarker(null);
              return;
            }
          }
        },
        { skipInitialization: true }
      ),
      editor.registerUpdateListener(() => {
        const marker = cutMarkerRef.current;
        if (marker) {
          updateStructuralOverlay(editor, marker.range, true, CUT_MARKER_OVERLAY);
        }
      }),
      editor.registerNodeTransform(ListItemNode, (node) => {
        if (!readyRef.current) {
          return;
        }
        $ensureNoteId(node);
      }),
      editor.registerCommand(
        COPY_COMMAND,
        () => {
          setCutMarker(null);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CUT_COMMAND,
        (event) => {
          const result = editor.getEditorState().read(() => {
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
              return { handled: false, marker: null };
            }

            const heads = selectionHeadKeys
              .map((key) => $getNodeByKey<ListItemNode>(key))
              .filter(
                (node): node is ListItemNode =>
                  $isListItemNode(node) && node.isAttached() && !isChildrenWrapper(node)
              );
            if (heads.length === 0) {
              return { handled: false, marker: null };
            }

            const range = getCutMarkerRange(heads);
            if (!range) {
              return { handled: false, marker: null };
            }

            const marker: CutMarker = {
              headKeys: selectionHeadKeys,
              markedKeys: $collectMarkedKeysFromHeadKeys(selectionHeadKeys),
              range,
            };
            const selection = $getSelection();
            $populateClipboardFromSelection(editor, selection, event);
            return { handled: true, marker };
          });
          setCutMarker(result.marker);
          if (result.marker) {
            editor.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge: 'start' });
          }
          return result.handled;
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
              setCutMarker(null);
              lastPasteSelectionHeadKeysRef.current = null;
              if ($insertNodesAtSelection(selectionHeadKeys, payload.selection, nodesToMove)) {
                return true;
              }
            }

            setCutMarker(null);
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
            setCutMarker(null);
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
