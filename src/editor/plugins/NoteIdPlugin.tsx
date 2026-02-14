import { $createListItemNode, $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import type { ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { BaseSelection, EditorState, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical';
import { $getHtmlContent, $getLexicalContent, setLexicalClipboardDataTransfer } from '@lexical/clipboard';
import type { LexicalClipboardData } from '@lexical/clipboard';
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
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
import { $autoExpandIfFolded } from '#lib/editor/fold-state';
import { $createNoteLinkNode } from '#lib/editor/note-link-node';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import {
  findNearestListItem,
  getContentListItem,
  $getOrCreateChildList,
  insertBefore,
  isChildrenWrapper,
  flattenNoteNodes,
} from '@/editor/outline/list-structure';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { resolveCaretPlacement } from '@/editor/outline/selection/caret-placement';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import type { OutlineSelectionRange } from '@/editor/outline/selection/model';
import { computeStructuralRangeFromHeads } from '@/editor/outline/selection/resolve';
import type { StructuralOverlayConfig } from '@/editor/outline/selection/overlay';
import { updateStructuralOverlay } from '@/editor/outline/selection/overlay';
import {
  getFirstDescendantListItem,
  getNestedList,
  getNextContentSibling,
  noteHasChildren,
  getSubtreeItems,
  removeNoteSubtree,
  sortHeadsByDocumentOrder,
} from '@/editor/outline/selection/tree';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '@/editor/commands';
import { parseNoteLinkUrl } from '@/editor/links/note-link-url';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { useCollaborationStatus } from './collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';
import { NOTE_ID_NORMALIZE_TAG } from '@/editor/update-tags';

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

function hasMarkedDirtyKey(marker: CutMarker, keys: NodeKey[], state: EditorState): boolean {
  if (keys.length === 0) {
    return false;
  }

  return state.read(() => {
    for (const key of keys) {
      const contentKey = $getContentKeyFromNodeKey(key);
      if (contentKey && marker.markedKeys.has(contentKey)) {
        return true;
      }
    }

    return false;
  });
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

function $createNoteItemWithText(text: string): ListItemNode {
  const item = $createListItemNode();
  item.append($createTextNode(text));
  $setState(item, noteIdState, createNoteId());
  return item;
}

function buildListItemsFromPlainText(text: string): ListItemNode[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => $createNoteItemWithText(line));
}

function $getPlainTextFromClipboardNodes(nodes: LexicalNode[]): string {
  const items = $extractClipboardListChildren(nodes);
  const lines: string[] = [];
  let hasListItems = false;
  for (const item of items) {
    if ($isListItemNode(item) && !isChildrenWrapper(item)) {
      hasListItems = true;
      lines.push(item.getTextContent());
    }
  }
  if (hasListItems) {
    return lines.join('\n');
  }
  return nodes.map((node) => node.getTextContent()).join('\n');
}

function resolvePasteSelectionHeadKeys(
  editor: LexicalEditor,
  selection: BaseSelection | null,
  cachedKeys: string[] | null
): string[] {
  let selectionHeadKeys = cachedKeys ?? [];
  if (selectionHeadKeys.length === 0) {
    const outlineSelection = editor.selection.get();
    if (outlineSelection?.kind === 'structural') {
      selectionHeadKeys =
        outlineSelection.headKeys.length > 0 ? outlineSelection.headKeys : outlineSelection.selectedKeys;
    }
  }
  if (selectionHeadKeys.length === 0 && $isRangeSelection(selection) && !selection.isCollapsed()) {
    const heads = getContiguousSelectionHeads(selection);
    selectionHeadKeys = heads.map((item) => getContentListItem(item).getKey());
  }
  return selectionHeadKeys;
}

function isInlineSelectionWithinSingleNote(selection: BaseSelection | null): boolean {
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return false;
  }

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    return false;
  }

  return getContentListItem(anchorItem) === getContentListItem(focusItem);
}

function $splitContentItemAtSelection(contentItem: ListItemNode, selection: BaseSelection | null): ListItemNode | null {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode) || anchorNode.getParent() !== contentItem) {
    return null;
  }

  const offset = selection.anchor.offset;
  const size = anchorNode.getTextContentSize();
  let splitStart: LexicalNode | null = null;
  if (offset <= 0) {
    splitStart = anchorNode;
  } else if (offset >= size) {
    splitStart = anchorNode.getNextSibling() ?? null;
  } else {
    const [, rightNode] = anchorNode.splitText(offset);
    splitStart = rightNode ?? null;
  }

  if (!splitStart) {
    return null;
  }

  const newItem = $createListItemNode();
  $setState(newItem, noteIdState, createNoteId());

  let child = contentItem.getFirstChild();
  while (child && child !== splitStart) {
    const next = child.getNextSibling();
    newItem.append(child);
    child = next;
  }

  if (newItem.getChildrenSize() === 0) {
    return null;
  }

  contentItem.insertBefore(newItem);
  return newItem;
}

function $insertFirstChildNotes(contentItem: ListItemNode | null, lines: string[]): void {
  if (!contentItem || lines.length === 0) {
    return;
  }
  const childList = $getOrCreateChildList(contentItem);
  const nodes = buildListItemsFromPlainText(lines.join('\n'));
  const firstChild = childList.getFirstChild();
  if (firstChild) {
    insertBefore(firstChild, nodes);
  } else {
    childList.append(...nodes);
  }
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

function $insertInternalLinkFromPlainText(
  plainText: string,
  currentDocId: string,
  outlineSelectionKind: 'structural' | 'caret' | 'inline' | null
): boolean {
  if (outlineSelectionKind === 'structural') {
    return false;
  }

  const trimmed = plainText.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const linkRef = parseNoteLinkUrl(trimmed, currentDocId);
  if (!linkRef) {
    return false;
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  if (!selection.isCollapsed() && !isInlineSelectionWithinSingleNote(selection)) {
    return false;
  }

  const linkNode = $createNoteLinkNode(linkRef, {});
  const resolvedTitle = linkRef.docId === currentDocId ? $findNoteById(linkRef.noteId)?.getTextContent() ?? null : null;
  linkNode.append($createTextNode(resolvedTitle ?? trimmed));
  selection.insertNodes([linkNode]);
  return true;
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
  let parentList: ListNode | null = null;
  let nextSibling: LexicalNode | null = null;

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
    const placement = resolveCaretPlacement(selection, contentItem);
    if (!placement) {
      return false;
    }

    if (placement === 'start') {
      nextSibling = contentItem;
    } else if (placement === 'middle') {
      const split = $splitContentItemAtSelection(contentItem, selection);
      nextSibling = split ? contentItem : getNextContentSibling(contentItem);
    } else {
      const nested = getNestedList(contentItem);
      if (nested && noteHasChildren(contentItem)) {
        $autoExpandIfFolded(contentItem);
        parentList = nested;
        nextSibling = getFirstDescendantListItem(nested);
      } else {
        nextSibling = getNextContentSibling(contentItem);
      }
    }
  } else {
    return false;
  }

  if (nextSibling) {
    insertBefore(nextSibling, nodes);
  } else {
    parentList.append(...nodes);
  }

  let lastInserted: ListItemNode | null = null;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if ($isListItemNode(node) && !isChildrenWrapper(node)) {
      lastInserted = node;
      break;
    }
  }

  if (orderedHeads.length > 0) {
    for (const head of orderedHeads.toReversed()) {
      removeNoteSubtree(head);
    }
  }

  if (lastInserted) {
    $selectItemEdge(getContentListItem(lastInserted), 'end');
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
      }, { tag: NOTE_ID_NORMALIZE_TAG });
    }

    return mergeRegister(
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, editorState, prevEditorState }) => {
        const marker = cutMarkerRef.current;
        if (!marker) {
          return;
        }

        const dirtyKeys: NodeKey[] = [];
        for (const key of dirtyElements.keys()) {
          dirtyKeys.push(key);
        }
        for (const key of dirtyLeaves) {
          dirtyKeys.push(key);
        }

        // dirty keys are empty for selection-only updates with no content changes.
        if (
          dirtyKeys.length > 0 &&
          (hasMarkedDirtyKey(marker, dirtyKeys, editorState) || hasMarkedDirtyKey(marker, dirtyKeys, prevEditorState))
        ) {
          setCutMarker(null);
          return;
        }

        updateStructuralOverlay(editor, marker.range, true, CUT_MARKER_OVERLAY);
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
          const outlineSelection = editor.selection.get();
          const isInlineSelection =
            outlineSelection?.kind !== 'structural' && isInlineSelectionWithinSingleNote(payload.selection);
          const selectionHeadKeys = resolvePasteSelectionHeadKeys(
            editor,
            payload.selection,
            lastPasteSelectionHeadKeysRef.current
          );

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
              let insertionKeys = selectionHeadKeys;
              let insertionSelection: BaseSelection | null = payload.selection;
              if (isInlineSelection && $isRangeSelection(insertionSelection) && !insertionSelection.isCollapsed()) {
                insertionSelection.insertText('');
                insertionSelection = $getSelection();
                insertionKeys = [];
              }
              setCutMarker(null);
              lastPasteSelectionHeadKeysRef.current = null;
              if ($insertNodesAtSelection(insertionKeys, insertionSelection, nodesToMove)) {
                return true;
              }
            }

            setCutMarker(null);
            lastPasteSelectionHeadKeysRef.current = null;
            return true;
          }

          if (isInlineSelection && $isRangeSelection(payload.selection)) {
            const inlineAnchor = findNearestListItem(payload.selection.anchor.getNode());
            const inlineContentItem = inlineAnchor ? getContentListItem(inlineAnchor) : null;
            const text = $getPlainTextFromClipboardNodes(payload.nodes);
            const lines = text.split(/\r?\n/);
            const shouldInsertNotes = lines.length > 1;

            if (shouldInsertNotes) {
              const [firstLine, ...restLines] = lines;
              payload.selection.insertText(firstLine ?? '');
              $insertFirstChildNotes(inlineContentItem, restLines);
              lastPasteSelectionHeadKeysRef.current = null;
              return true;
            }

            payload.selection.insertText(text);
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
          if (clipboardPayload) {
            return false;
          }

          if (!isClipboardEvent(event) || !event.clipboardData) {
            return false;
          }

          const plainText = event.clipboardData.getData('text/plain');
          if (!plainText) {
            return false;
          }

          const lines = plainText.split(/\r?\n/);
          if (lines.length === 1) {
            const handled = $insertInternalLinkFromPlainText(
              plainText,
              docId,
              outlineSelection?.kind ?? null
            );
            if (handled) {
              lastPasteSelectionHeadKeysRef.current = null;
              event.preventDefault();
              return true;
            }
          }

          if (lines.length <= 1) {
            return false;
          }

          const selection = $getSelection();
          const isInlineSelection =
            outlineSelection?.kind !== 'structural' && isInlineSelectionWithinSingleNote(selection);
          const selectionHeadKeys = resolvePasteSelectionHeadKeys(
            editor,
            selection,
            lastPasteSelectionHeadKeysRef.current
          );
          const isCaret = $isRangeSelection(selection) && selection.isCollapsed();
          if (selectionHeadKeys.length === 0 && !isCaret) {
            return false;
          }

          let handled = false;
          if ($isRangeSelection(selection) && !selection.isCollapsed() && isInlineSelection) {
            const inlineAnchor = findNearestListItem(selection.anchor.getNode());
            const inlineContentItem = inlineAnchor ? getContentListItem(inlineAnchor) : null;
            const [firstLine, ...restLines] = lines;
            selection.insertText(firstLine ?? '');
            $insertFirstChildNotes(inlineContentItem, restLines);
            handled = true;
          } else {
            const nodes = buildListItemsFromPlainText(plainText);
            handled = $insertNodesAtSelection(selectionHeadKeys, selection, nodes);
          }
          if (handled) {
            lastPasteSelectionHeadKeysRef.current = null;
          }

          if (handled) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
