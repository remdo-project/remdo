import { $createListItemNode, $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import type { ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { BaseSelection, EditorState, LexicalEditor, LexicalNode, NodeKey, RangeSelection, SerializedLexicalNode } from 'lexical';
import { $getHtmlContent, $getLexicalContent, setLexicalClipboardDataTransfer } from '@lexical/clipboard';
import type { LexicalClipboardData } from '@lexical/clipboard';
import {
  $copyNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
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
import { createUniqueNoteId, createNoteIdAvoiding } from '#domain/notes/ids';
import { $autoExpandIfFolded } from '#client/editor/runtime/fold-state';
import { isBodyWrapper } from '#client/editor/features/note-body/note-body-node';
import { $createNoteLinkNode } from '#client/editor/runtime/note-link-node';
import { $getNoteId, noteIdState } from '#client/editor/runtime/note-id-state';
import { isSerializedBodyWrapper } from '#client/editor/runtime/serialized-note-types';
import {
  $getOrCreateChildList,
  getBodyWrapper,
  getContentSiblings,
  insertBefore,
  isChildrenWrapper,
  isContentItem,
  flattenNoteNodes,
} from '#client/editor/outline/list-structure';
import { getNoteBody, $getSelectionBody, $resolveNoteForSelectionPoint } from '#client/editor/features/note-body/note-body-ops';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { getZoomBoundary } from '#client/editor/outline/selection/boundary';
import { $selectItemEdge } from '#client/editor/outline/selection/caret';
import { resolveCaretPlacement } from '#client/editor/outline/selection/caret-placement';
import { $resolveStructuralDeletionHeads } from '#client/editor/outline/selection/deletion';
import type { OutlineSelectionRange } from '#client/editor/outline/selection/model';
import { $collectStructuralItemKeysFromRange } from '#client/editor/outline/selection/range';
import {
  $resolveStructuralRangeFromLexicalSelection,
  $resolveStructuralRangeFromOutlineSelection,
} from '#client/editor/outline/selection/structural-range';
import type { StructuralOverlayConfig } from '#client/editor/outline/selection/overlay';
import { updateStructuralOverlay } from '#client/editor/outline/selection/overlay';
import {
  getFirstDescendantListItem,
  getNestedList,
  getNextContentSibling,
  noteHasChildren,
  removeNoteHeads,
} from '#client/editor/outline/selection/tree';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '#client/editor/commands';
import { parseOwnedNoteLinkUrl } from '#client/editor/links/note-link-url';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { useCollaborationStatus } from './collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';
import { NOTE_ID_NORMALIZE_TAG } from '#client/editor/update-tags';

const NEWLINE_PATTERN = /\r?\n/;

interface CutMarker {
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
  // A node inside a body belongs to its owner note, so a dirty key under a cut
  // note's body maps back to that note — editing the body invalidates the cut.
  return $resolveNoteForSelectionPoint(node)?.getKey() ?? null;
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

function hasBoundaryDirtyKey(marker: CutMarker, keys: NodeKey[], state: EditorState): boolean {
  if (keys.length === 0) {
    return false;
  }

  return state.read(() => {
    const boundaryKeys = $collectStructuralItemKeysFromRange(marker.range);
    if (boundaryKeys.size === 0) {
      return false;
    }

    for (const key of keys) {
      const contentKey = $getContentKeyFromNodeKey(key);
      if (contentKey && boundaryKeys.has(contentKey)) {
        return true;
      }
    }

    return false;
  });
}

function $isCaretWithinMarkedSelection(marker: CutMarker, selection: BaseSelection | null): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  // A caret inside a cut note's body is still inside the cut boundary (the body
  // travels with the note), so resolve body points to their owner note.
  const contentItem = $resolveNoteForSelectionPoint(selection.anchor.getNode());
  if (!contentItem) {
    return false;
  }

  return marker.markedKeys.has(contentItem.getKey());
}

function $ensureNoteId(item: ListItemNode) {
  // Adjacency wrappers (children-wrapper, body-wrapper) are not notes.
  if (isChildrenWrapper(item) || isBodyWrapper(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createUniqueNoteId());
}

function $createNoteItemWithText(text: string): ListItemNode {
  const item = $createListItemNode();
  item.append($createTextNode(text));
  $setState(item, noteIdState, createUniqueNoteId());
  return item;
}

function buildListItemsFromPlainText(text: string): ListItemNode[] {
  const lines = text.split(NEWLINE_PATTERN);
  return lines.map((line) => $createNoteItemWithText(line));
}

function $getPlainTextFromClipboardNodes(nodes: LexicalNode[]): string {
  const items = $extractClipboardListChildren(nodes);
  const contentItems = items.filter(isContentItem);
  if (contentItems.length > 0) {
    // Each note's own text, then its body text, then its sub-notes — the same
    // traversal as structural copy, so a copied note's body is not dropped when
    // it is pasted over an inline selection.
    return contentItems.flatMap(noteClipboardPlainText).join('\n');
  }
  return nodes.map((node) => node.getTextContent()).join('\n');
}

function $cloneClipboardNodeTree<T extends LexicalNode>(node: T): T {
  const clone = $copyNode(node);
  if ($isElementNode(node) && $isElementNode(clone)) {
    const childClones = node.getChildren().map((child) => $cloneClipboardNodeTree(child));
    clone.append(...childClones);
  }
  return clone;
}

function $extractInlineClipboardNodes(nodes: LexicalNode[]): LexicalNode[] {
  const items = $extractClipboardListChildren(nodes);
  if (items.length === 1) {
    const [item] = items;
    if (isContentItem(item)) {
      return item.getChildren().map($cloneClipboardNodeTree);
    }
  }

  if (items.length === 0) {
    const inlineNodes: LexicalNode[] = [];
    for (const node of nodes) {
      if ($isElementNode(node) && !node.isInline()) {
        inlineNodes.push(...node.getChildren().map($cloneClipboardNodeTree));
      } else {
        inlineNodes.push($cloneClipboardNodeTree(node));
      }
    }
    return inlineNodes;
  }

  return [];
}

// Insert clipboard nodes into a note body (rich text). Inline content (a single
// copied note's children, or already-inline nodes) keeps its rich nodes — note
// links, date tokens, formatting — via `$insertNodes`. A structural/multi-note
// payload cannot live in a body as structure, so it flattens to plain text.
function $insertClipboardNodesIntoBody(selection: RangeSelection, nodes: LexicalNode[]): void {
  const inlineNodes = $extractInlineClipboardNodes(nodes);
  if (inlineNodes.length > 0) {
    $insertNodes(inlineNodes);
  } else {
    // A flattened multi-note payload is multi-line; insertRawText turns the
    // newlines into LineBreakNodes (the body's line representation) rather than
    // literal "\n" inside a text node, which the body line nav relies on.
    selection.insertRawText($getPlainTextFromClipboardNodes(nodes));
  }
}

function $resolvePasteSelectionRange(
  editor: LexicalEditor,
  selection: BaseSelection | null,
  cachedRange: OutlineSelectionRange | null
): OutlineSelectionRange | null {
  return (
    cachedRange
    ?? $resolveStructuralRangeFromOutlineSelection(editor.selection.get())
    ?? $resolveStructuralRangeFromLexicalSelection(selection)
  );
}

function $isInlineSelectionWithinSingleNote(selection: BaseSelection | null): boolean {
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return false;
  }

  const anchorItem = resolveContentItemFromNode(selection.anchor.getNode());
  const focusItem = resolveContentItemFromNode(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    return false;
  }

  return anchorItem === focusItem;
}

function $splitContentItemAtSelection(
  contentItem: ListItemNode,
  selection: BaseSelection | null,
  destination: 'sibling' | 'first-child' = 'sibling'
): ListItemNode | null {
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
  $setState(newItem, noteIdState, createUniqueNoteId());

  if (destination === 'first-child') {
    let child: LexicalNode | null = splitStart;
    while (child) {
      const nextSibling: LexicalNode | null = child.getNextSibling();
      newItem.append(child);
      child = nextSibling;
    }
  } else {
    let child = contentItem.getFirstChild();
    while (child && child !== splitStart) {
      const next = child.getNextSibling();
      newItem.append(child);
      child = next;
    }
  }

  if (newItem.getChildrenSize() === 0) {
    return null;
  }

  if (destination === 'first-child') {
    const childList = $getOrCreateChildList(contentItem);
    const firstChild = childList.getFirstChild();
    if (firstChild) {
      insertBefore(firstChild, [newItem]);
    } else {
      childList.append(newItem);
    }
  } else {
    contentItem.insertBefore(newItem);
  }
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

function $regenerateClipboardNoteIds(nodes: LexicalNode[], reservedIds: Set<string>) {
  const stack = nodes.toReversed();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (isContentItem(node)) {
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
  currentOrigin: string,
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

  const linkRef = parseOwnedNoteLinkUrl(trimmed, { currentDocId, currentOrigin });
  if (!linkRef) {
    return false;
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  if (!selection.isCollapsed() && !$isInlineSelectionWithinSingleNote(selection)) {
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

// Serialize a node and its full subtree to the clipboard JSON shape. A node's
// own exportJSON() does not include children (the export traversal fills them),
// so recurse explicitly.
function serializeNodeTree(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON() as SerializedLexicalNode & { children?: SerializedLexicalNode[] };
  if ($isElementNode(node)) {
    json.children = node.getChildren().map(serializeNodeTree);
  }
  return json;
}

type SerializedElement = SerializedLexicalNode & { noteId?: string; children?: SerializedLexicalNode[] };

// Splice each note's body-wrapper into Lexical's serialized clipboard nodes,
// right after the note's content list item, so a copied note carries its body.
// Lexical's serialization already produces the correct content shape (inline for
// a bare note, list-wrapped when structural) but omits the body-wrapper, which is
// not part of the selection's node span; this adds it from the live note. Walks
// the whole tree so a sub-note's body (in a nested children list) is carried too.
function $injectNoteBodiesIntoClipboardNodes(nodes: SerializedLexicalNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i] as SerializedElement;
    if (Array.isArray(node.children)) {
      $injectNoteBodiesIntoClipboardNodes(node.children);
    }
    if (node.type !== 'listitem' || typeof node.noteId !== 'string') {
      continue;
    }
    const note = $findNoteById(node.noteId);
    const body = note ? getBodyWrapper(note) : null;
    if (!body) {
      continue;
    }
    // Always carry the full live body. Lexical may already have serialized a
    // body-wrapper here — either the complete one (between two selected notes) or
    // a partial one when a structural selection ends mid-body — so replace any
    // existing serialized body-wrapper rather than appending a second.
    if (isSerializedBodyWrapper(nodes[i + 1])) {
      nodes.splice(i + 1, 1, serializeNodeTree(body));
    } else {
      nodes.splice(i + 1, 0, serializeNodeTree(body));
    }
  }
}

// The plain-text line(s) a note contributes: its own text, then its body's text.
function noteClipboardPlainText(note: ListItemNode): string[] {
  const lines = [getNoteOwnText(note)];
  const body = getNoteBody(note);
  if (body) {
    lines.push(body.getTextContent());
  }
  const nested = getNestedList(note);
  if (nested) {
    for (const child of getContentSiblings(nested)) {
      lines.push(...noteClipboardPlainText(child));
    }
  }
  return lines;
}

// Whole-note clipboard population (copy/cut). A note's body and sub-notes are
// content it owns, so they travel with it. Reuse Lexical's serialization for the
// content/links/structure and inject the body-wrappers it omits; build the plain
// text as each note's own text followed by its body text. `isCut` tags the
// payload so a same-document cut-paste can move the originals. Returns false for
// non-structural selections, leaving inline copy to Lexical's default handler.
function $populateClipboardFromSelection(
  editor: LexicalEditor,
  heads: ListItemNode[],
  selection: BaseSelection | null,
  event: ClipboardEvent | KeyboardEvent | null,
  isCut: boolean
): boolean {
  if (!isClipboardEvent(event) || !event.clipboardData || heads.length === 0) {
    return false;
  }

  const lexical = $getLexicalContent(editor, selection);
  if (!lexical) {
    return false;
  }
  let payload: ClipboardPayload;
  try {
    payload = JSON.parse(lexical) as ClipboardPayload;
  } catch {
    return false;
  }
  $injectNoteBodiesIntoClipboardNodes(payload.nodes);
  if (isCut) {
    payload.remdoCut = true;
  }

  const data: LexicalClipboardData = {
    'text/plain': heads.flatMap(noteClipboardPlainText).join('\n'),
    'application/x-lexical-editor': JSON.stringify(payload),
  };
  const html = $getHtmlContent(editor, selection);
  if (html) {
    data['text/html'] = html;
  }

  event.preventDefault();
  setLexicalClipboardDataTransfer(event.clipboardData, data);
  return true;
}

// The whole-note (structural) context a copy or cut acts on: the current
// selection, its structural range, and the selected note heads. Null when the
// selection is not a non-empty whole-note selection (inline selections defer to
// Lexical's default copy).
function $resolveStructuralClipboardContext(
  editor: LexicalEditor
): { selection: BaseSelection | null; selectionRange: OutlineSelectionRange; heads: ListItemNode[] } | null {
  const selection = $getSelection();
  const selectionRange =
    $resolveStructuralRangeFromOutlineSelection(editor.selection.get())
    ?? $resolveStructuralRangeFromLexicalSelection(selection, { requireMultipleHeads: true });
  if (!selectionRange) {
    return null;
  }
  const heads = $resolveStructuralDeletionHeads(selectionRange, selection);
  return heads.length === 0 ? null : { selection, selectionRange, heads };
}

function $insertNodesAtSelection(
  editor: LexicalEditor,
  structuralRange: OutlineSelectionRange | null,
  selection: BaseSelection | null,
  nodes: LexicalNode[]
): boolean {
  if (nodes.length === 0) {
    return false;
  }

  let orderedHeads: ListItemNode[] = [];
  let parentList: ListNode | null = null;
  let nextSibling: LexicalNode | null = null;

  if (structuralRange) {
    orderedHeads = $resolveStructuralDeletionHeads(structuralRange, selection);
    if (orderedHeads.length === 0) {
      return false;
    }
    const zoomBoundaryKey = getZoomBoundary(editor);
    const zoomRootHead =
      zoomBoundaryKey === null ? null : orderedHeads.find((head) => head.getKey() === zoomBoundaryKey) ?? null;
    if (zoomRootHead) {
      parentList = $getOrCreateChildList(zoomRootHead);
      nextSibling = getFirstDescendantListItem(parentList);
      const replacementHeads = orderedHeads.filter((head) => head !== zoomRootHead);
      orderedHeads = replacementHeads.length > 0 ? replacementHeads : getContentSiblings(parentList);
    } else {
      const lastHead = orderedHeads.at(-1)!;
      parentList = lastHead.getParent();
      if (!$isListNode(parentList)) {
        return false;
      }
      nextSibling = getNextContentSibling(lastHead);
    }
  } else if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
    if (!contentItem) {
      return false;
    }
    parentList = contentItem.getParent();
    if (!$isListNode(parentList)) {
      return false;
    }
    const placement = resolveCaretPlacement(selection, contentItem);
    if (!placement) {
      return false;
    }
    const zoomBoundaryKey = getZoomBoundary(editor);
    const isZoomRoot = zoomBoundaryKey !== null && contentItem.getKey() === zoomBoundaryKey;

    if (placement === 'start') {
      if (isZoomRoot) {
        parentList = $getOrCreateChildList(contentItem);
        nextSibling = getFirstDescendantListItem(parentList);
      } else {
        nextSibling = contentItem;
      }
    } else if (placement === 'middle') {
      if (isZoomRoot) {
        parentList = $getOrCreateChildList(contentItem);
        const split = $splitContentItemAtSelection(contentItem, selection, 'first-child');
        nextSibling = split ?? getFirstDescendantListItem(parentList);
      } else {
        const split = $splitContentItemAtSelection(contentItem, selection);
        nextSibling = split ? contentItem : getNextContentSibling(contentItem);
      }
    } else {
      if (isZoomRoot) {
        parentList = $getOrCreateChildList(contentItem);
        nextSibling = getFirstDescendantListItem(parentList);
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
    if (isContentItem(node)) {
      lastInserted = node;
      break;
    }
  }

  if (orderedHeads.length > 0) {
    removeNoteHeads(orderedHeads);
  }

  if (lastInserted) {
    $selectItemEdge(lastInserted, 'end');
  }

  return true;
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);
  const lastPasteSelectionRangeRef = useRef<OutlineSelectionRange | null>(null);
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
          (
            hasMarkedDirtyKey(marker, dirtyKeys, editorState) ||
            hasMarkedDirtyKey(marker, dirtyKeys, prevEditorState) ||
            hasBoundaryDirtyKey(marker, dirtyKeys, editorState) ||
            hasBoundaryDirtyKey(marker, dirtyKeys, prevEditorState)
          )
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
        (event) => {
          setCutMarker(null);
          // For a whole-note (structural) selection, build the clipboard from the
          // selected notes so each note carries its body and sub-notes. Inline
          // selections fall through to Lexical's default text/rich-text copy.
          const context = $resolveStructuralClipboardContext(editor);
          if (!context) {
            return false;
          }
          return $populateClipboardFromSelection(editor, context.heads, context.selection, event, false);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CUT_COMMAND,
        (event) => {
          // Runs inside Lexical's command update context. Populate the clipboard,
          // then collapse in the same update so the committed selection (and the
          // outline-selection snapshot derived from it) is observed atomically.
          const context = $resolveStructuralClipboardContext(editor);
          if (!context) {
            return false;
          }

          const marker: CutMarker = {
            markedKeys: $collectStructuralItemKeysFromRange(context.selectionRange),
            range: context.selectionRange,
          };
          $populateClipboardFromSelection(editor, context.heads, context.selection, event, true);
          setCutMarker(marker);
          editor.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge: 'start' });
          return true;
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

          // A selection inside a body is rich text, not outline structure, so a
          // paste there inserts the clipboard's plain text (never list nodes,
          // which would break the outline). This also covers a collapsed caret.
          const pasteBody = $isRangeSelection(payload.selection)
            ? $getSelectionBody(payload.selection)
            : null;

          // For a non-cut paste the body insert is unconditional; a cut-paste
          // must first honor the cut no-op rule below (pasting inside the cut
          // boundary does nothing and leaves the cut pending), so it is handled
          // within the wasCutPaste block.
          if (pasteBody && !wasCutPaste && $isRangeSelection(payload.selection)) {
            setCutMarker(null);
            lastPasteSelectionRangeRef.current = null;
            $insertClipboardNodesIntoBody(payload.selection, payload.nodes);
            return true;
          }

          const marker = cutMarkerRef.current;
          const outlineSelection = editor.selection.get();
          const isInlineSelection =
            outlineSelection?.kind !== 'structural' && $isInlineSelectionWithinSingleNote(payload.selection);
          const selectionRange = $resolvePasteSelectionRange(
            editor,
            payload.selection,
            lastPasteSelectionRangeRef.current
          );

          if (wasCutPaste) {
            if (!marker) {
              lastPasteSelectionRangeRef.current = null;
              return true;
            }

            const caretInMarked =
              selectionRange === null && $isCaretWithinMarkedSelection(marker, payload.selection);
            const selectedMarkedKeys =
              selectionRange === null
                ? null
                : $collectStructuralItemKeysFromRange(selectionRange);
            const intersection =
              caretInMarked ||
              (selectedMarkedKeys !== null && [...selectedMarkedKeys].some((key) => marker.markedKeys.has(key)));
            if (intersection) {
              lastPasteSelectionRangeRef.current = null;
              return true;
            }

            // A body is rich text and cannot structurally hold the cut notes, so
            // there is no valid move target here. Interim behavior: no-op, leave
            // the cut pending (never inject list nodes into the body, and never
            // copy-without-moving). Final semantics are deferred to the cut/paste
            // redesign — see docs/todo.md.
            if (pasteBody) {
              lastPasteSelectionRangeRef.current = null;
              return true;
            }

            const ordered = $resolveStructuralDeletionHeads(marker.range, payload.selection);
            if (ordered.length > 0) {
              const nodesToMove = flattenNoteNodes(ordered);
              let insertionRange = selectionRange;
              let insertionSelection: BaseSelection | null = payload.selection;
              if (isInlineSelection && $isRangeSelection(insertionSelection) && !insertionSelection.isCollapsed()) {
                insertionSelection.insertText('');
                insertionSelection = $getSelection();
                insertionRange = null;
              }
              setCutMarker(null);
              lastPasteSelectionRangeRef.current = null;
              if ($insertNodesAtSelection(editor, insertionRange, insertionSelection, nodesToMove)) {
                return true;
              }
            }

            setCutMarker(null);
            lastPasteSelectionRangeRef.current = null;
            return true;
          }

          if (isInlineSelection && $isRangeSelection(payload.selection)) {
            const inlineContentItem = resolveContentItemFromNode(payload.selection.anchor.getNode());
            const text = $getPlainTextFromClipboardNodes(payload.nodes);
            const lines = text.split(NEWLINE_PATTERN);
            const shouldInsertNotes = lines.length > 1;

            if (shouldInsertNotes) {
              const [firstLine, ...restLines] = lines;
              payload.selection.insertText(firstLine ?? '');
              $insertFirstChildNotes(inlineContentItem, restLines);
              lastPasteSelectionRangeRef.current = null;
              return true;
            }

            const inlineNodes = $extractInlineClipboardNodes(payload.nodes);
            if (inlineNodes.length > 0) {
              $insertNodes(inlineNodes);
            } else {
              payload.selection.insertText(text);
            }
            lastPasteSelectionRangeRef.current = null;
            return true;
          }

          const reservedIds = new Set<string>();
          if (docId.length > 0) {
            reservedIds.add(docId);
          }
          $regenerateClipboardNoteIds(payload.nodes, reservedIds);
          const insertNodes = $extractClipboardListChildren(payload.nodes);
          lastPasteSelectionRangeRef.current = null;
          return $insertNodesAtSelection(editor, selectionRange, payload.selection, insertNodes);
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const outlineSelection = editor.selection.get();
          const outlineRange = $resolveStructuralRangeFromOutlineSelection(outlineSelection);
          lastPasteSelectionRangeRef.current = outlineRange ? { ...outlineRange } : null;
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

          const lines = plainText.split(NEWLINE_PATTERN);
          if (lines.length === 1) {
            const currentOrigin = globalThis.location.origin;
            const handled = $insertInternalLinkFromPlainText(
              plainText,
              currentOrigin,
              docId,
                outlineSelection?.kind ?? null
            );
            if (handled) {
              lastPasteSelectionRangeRef.current = null;
              event.preventDefault();
              return true;
            }
          }

          if (lines.length <= 1) {
            return false;
          }

          const selection = $getSelection();

          // A selection inside a body is rich text: paste the plain text into the
          // body, never as list nodes that break the outline. insertRawText turns
          // newlines into LineBreakNodes (the body's line representation that line
          // nav relies on), not literal "\n" inside a text node.
          if ($isRangeSelection(selection) && $getSelectionBody(selection)) {
            lastPasteSelectionRangeRef.current = null;
            selection.insertRawText(plainText);
            event.preventDefault();
            return true;
          }

          const isInlineSelection =
            outlineSelection?.kind !== 'structural' && $isInlineSelectionWithinSingleNote(selection);
          const selectionRange = $resolvePasteSelectionRange(
            editor,
            selection,
            lastPasteSelectionRangeRef.current
          );
          const isCaret = $isRangeSelection(selection) && selection.isCollapsed();
          if (!selectionRange && !isCaret) {
            return false;
          }

          let handled = false;
          if ($isRangeSelection(selection) && !selection.isCollapsed() && isInlineSelection) {
            const inlineContentItem = resolveContentItemFromNode(selection.anchor.getNode());
            const [firstLine, ...restLines] = lines;
            selection.insertText(firstLine ?? '');
            $insertFirstChildNotes(inlineContentItem, restLines);
            handled = true;
          } else {
            const nodes = buildListItemsFromPlainText(plainText);
            handled = $insertNodesAtSelection(editor, selectionRange, selection, nodes);
          }
          if (handled) {
            lastPasteSelectionRangeRef.current = null;
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
