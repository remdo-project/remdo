import { $createListItemNode, $isListItemNode, $isListNode } from '@lexical/list';
import type { ListItemNode, ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { BaseSelection, LexicalEditor, LexicalNode, RangeSelection, SerializedLexicalNode } from 'lexical';
import { $getHtmlContent, $getLexicalContent, setLexicalClipboardDataTransfer } from '@lexical/clipboard';
import type { LexicalClipboardData } from '@lexical/clipboard';
import {
  $addUpdateTag,
  $createLineBreakNode,
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  $isLineBreakNode,
  $isTextNode,
  $setState,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_TAG,
  CUT_COMMAND,
  PASTE_TAG,
  PASTE_COMMAND,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  mergeRegister,
} from 'lexical';
import { useEffect, useRef } from 'react';
import { createUniqueNoteId } from '#domain/notes/ids';
import { $createNoteLinkNode } from '#client/editor/features/links/note-link-node';
import { $getNoteId, noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import {
  $getOrCreateChildList,
  getBodyWrapper,
  getContentSiblings,
  getNodesForNote,
  getPreviousContentSibling,
  insertBefore,
  isContentItem,
  isChildrenWrapper,
} from '#client/editor/outline/list-structure';
import { getNoteBody, $getSelectionBody } from '#client/editor/outline/selection/body-region';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { getViewRoot } from '#client/editor/outline/view-root';
import { $selectItemEdge, isPointAtBoundary } from '#client/editor/outline/selection/caret';
import { resolveCaretPlacement } from '#client/editor/outline/selection/caret-placement';
import { $resolveStructuralDeletionHeads } from '#client/editor/outline/selection/deletion';
import type { OutlineSelectionRange } from '#client/editor/outline/selection/model';
import {
  $resolveStructuralRangeFromLexicalSelection,
  $resolveStructuralRangeFromOutlineSelection,
} from '#client/editor/outline/selection/structural-range';
import {
  getFirstDescendantListItem,
  getNestedList,
  getNextContentSibling,
  getParentContentItem,
  getSubtreeTail,
  noteHasChildren,
  removeNoteHeads,
} from '#client/editor/outline/selection/tree';
import { parseOwnedNoteLinkUrl } from '#client/editor/features/links/note-link-url';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { useCollaborationStatus } from '#client/editor/runtime/collaboration';
import { $autoExpandIfFolded } from '#client/editor/outline/fold-state';
import {
  $insertFirstChildNodes,
  $splitContentItemAtSelection,
} from '#client/editor/outline/selection/split-content-item';
import { $deleteNotesInRange } from '#client/editor/outline/selection/delete-selection';
import { $isNoteBodyNode } from '#client/editor/outline/note-body-node';

const NEWLINE_PATTERN = /\r\n|[\r\n]/;

type ClipboardOperation = 'copy' | 'cut';

interface RemDoClipboardSourceGap {
  kind: 'before' | 'after' | 'first-child';
  noteId: string;
}

interface RemDoClipboardProvenance {
  sourceDocumentId: string;
  sourceGap?: RemDoClipboardSourceGap;
}

interface ClipboardPayload {
  namespace: string;
  nodes: SerializedLexicalNode[];
  remdo?: RemDoClipboardProvenance;
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

function getClipboardProvenance(payload: ClipboardPayload | null): RemDoClipboardProvenance | null {
  const provenance = payload?.remdo;
  if (
    !provenance ||
    typeof provenance.sourceDocumentId !== 'string'
  ) {
    return null;
  }
  return provenance;
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
  return nodes.flatMap((node) => {
    if ($isListNode(node)) return getContentSiblings(node).flatMap(noteClipboardPlainText);
    if (isContentItem(node)) return noteClipboardPlainText(node);
    return [node.getTextContent()];
  }).join('\n');
}

function $normalizeClipboardLabelBreaks(nodes: LexicalNode[]): void {
  for (const node of nodes) {
    if ($isNoteBodyNode(node)) continue;
    if ($isLineBreakNode(node)) {
      const space = $createTextNode(' ');
      const previous = node.getPreviousSibling();
      const next = node.getNextSibling();
      if ($isTextNode(previous) && $isTextNode(next)) {
        space.setFormat(previous.getFormat() & next.getFormat());
        if (previous.getStyle() === next.getStyle()) space.setStyle(previous.getStyle());
      }
      node.replace(space);
    } else if ($isTextNode(node)) {
      node.setTextContent(node.getTextContent().replace(/\r\n|[\r\n]/g, ' '));
    } else if ($isElementNode(node)) {
      $normalizeClipboardLabelBreaks(node.getChildren());
    }
  }
}

function $hasClipboardBody(nodes: LexicalNode[]): boolean {
  return nodes.some((node) => $isNoteBodyNode(node)
    || ($isElementNode(node) && $hasClipboardBody(node.getChildren())));
}

function $promoteLeadingClipboardChildren(nodes: LexicalNode[]): void {
  for (const node of nodes) {
    if (!$isElementNode(node) || $isNoteBodyNode(node)) continue;
    $promoteLeadingClipboardChildren(node.getChildren());
    if (!$isListNode(node)) continue;
    let first = node.getFirstChild();
    while (isChildrenWrapper(first)) {
      const nested = first.getFirstChild();
      if ($isListNode(nested)) insertBefore(first, nested.getChildren());
      first.remove();
      first = node.getFirstChild();
    }
  }
}

function $clipboardNodesToNotes(nodes: LexicalNode[]): LexicalNode[] {
  const notes: LexicalNode[] = [];
  let inlineItem: ListItemNode | null = null;
  for (const node of nodes) {
    if ($isListNode(node) || $isListItemNode(node)) {
      notes.push(...($isListNode(node) ? node.getChildren() : [node]));
      inlineItem = null;
    } else if ($isElementNode(node) && !node.isInline()) {
      notes.push($createListItemNode().append(...node.getChildren()));
      inlineItem = null;
    } else {
      if (!inlineItem) {
        inlineItem = $createListItemNode();
        notes.push(inlineItem);
      }
      inlineItem.append(node);
    }
  }
  $normalizeClipboardLabelBreaks(notes);
  return notes;
}

function $extractSingleNoteLabelNodes(nodes: LexicalNode[]): LexicalNode[] | null {
  if (nodes.some((node) => !$isListNode(node) && !$isListItemNode(node))) return null;
  const contentItems = $extractClipboardListChildren(nodes).filter(isContentItem);
  if (contentItems.length !== 1) {
    return null;
  }

  // A structural payload can place the note's body-wrapper beside the content
  // item and its subtree list inside it. A body is an inline destination, so
  // only the note label's rich inline children belong there.
  return contentItems[0]!
    .getChildren()
    .filter((child) => !$isListNode(child));
}

function $extractInlineClipboardNodes(nodes: LexicalNode[]): LexicalNode[] {
  const items = $extractClipboardListChildren(nodes);
  if (items.length === 0) {
    const inlineNodes: LexicalNode[] = [];
    for (const node of nodes) {
      if ($isElementNode(node) && !node.isInline()) {
        if (inlineNodes.length > 0) inlineNodes.push($createLineBreakNode());
        inlineNodes.push(...node.getChildren());
      } else {
        inlineNodes.push(node);
      }
    }
    return inlineNodes;
  }

  return [];
}

// Insert clipboard nodes into a note body (rich text). A single copied note's
// rich inline label, or already-inline nodes, keeps note links, date tokens,
// and formatting via `$insertNodes`. A structural/multi-note
// payload cannot live in a body as structure, so it flattens to plain text.
function $insertClipboardNodesIntoBody(selection: RangeSelection, nodes: LexicalNode[]): void {
  const singleNoteLabelNodes = $extractSingleNoteLabelNodes(nodes);
  if (singleNoteLabelNodes !== null) {
    if (singleNoteLabelNodes.length > 0) {
      $insertNodes(singleNoteLabelNodes);
    }
    return;
  }

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

function $insertFirstChildNotes(contentItem: ListItemNode | null, lines: string[]): void {
  if (!contentItem || lines.length === 0) {
    return;
  }
  const nodes = buildListItemsFromPlainText(lines.join('\n'));
  $insertFirstChildNodes(contentItem, nodes);
}

function $clearClipboardNoteIds(nodes: LexicalNode[]) {
  const stack = nodes.toReversed();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (isContentItem(node)) {
      $setState(node, noteIdState, undefined);
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

function $canPreserveClipboardNoteIds(
  nodes: LexicalNode[],
  provenance: RemDoClipboardProvenance | null,
  currentDocumentId: string
): boolean {
  if (
    !provenance ||
    currentDocumentId.length === 0 ||
    provenance.sourceDocumentId !== currentDocumentId
  ) {
    return false;
  }

  const seenIds = new Set<string>();
  let noteCount = 0;
  const stack = nodes.toReversed();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (isContentItem(node)) {
      noteCount += 1;
      const noteId = $getNoteId(node);
      if (!noteId || noteId === currentDocumentId || seenIds.has(noteId) || $findNoteById(noteId)) {
        return false;
      }
      seenIds.add(noteId);
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

  return noteCount > 0;
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

  // A note link can replace a selection that stays within one editable region:
  // a collapsed caret, an inline range within one note's content, or a range
  // within one body (bodies are rich text and support note links).
  if (
    !selection.isCollapsed() &&
    !$isInlineSelectionWithinSingleNote(selection) &&
    !$getSelectionBody(selection)
  ) {
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

function clearSerializedNoteIds(nodes: SerializedLexicalNode[]): void {
  for (const node of nodes) {
    const element = node as SerializedElement;
    if (element.type === 'listitem') {
      delete element.noteId;
    }
    if (Array.isArray(element.children)) {
      clearSerializedNoteIds(element.children);
    }
  }
}

function $serializeStructuralHeads(heads: ListItemNode[]): SerializedLexicalNode[] | null {
  const parentList = heads[0]?.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }

  const list = parentList.exportJSON() as SerializedElement;
  list.children = heads.flatMap((head) => getNodesForNote(head).map(serializeNodeTree));
  return [list];
}

// Plain text follows reading order: own text, body text, then descendants.
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

function $captureClipboardSourceGap(heads: ListItemNode[]): RemDoClipboardSourceGap | null {
  const firstHead = heads[0];
  const lastHead = heads.at(-1);
  if (!firstHead || !lastHead) {
    return null;
  }

  const parentNote = getParentContentItem(firstHead);
  const previousSibling = getPreviousContentSibling(firstHead);
  const nextSibling = getNextContentSibling(lastHead);
  const anchor = nextSibling ?? previousSibling ?? parentNote;
  if (!anchor) {
    return null;
  }

  const noteId = $getNoteId(anchor);
  if (!noteId) {
    return null;
  }

  return {
    kind: nextSibling ? 'before' : previousSibling ? 'after' : 'first-child',
    noteId,
  };
}

// Whole-note clipboard population (copy/cut). A note's body and sub-notes are
// content it owns, so they travel with it. Reuse Lexical's clipboard envelope
// and serialize the resolved semantic note heads directly, including their
// bodies and subtrees. RemDo provenance identifies same-document cuts without
// keeping live source nodes or mutable clipboard state. Returns false for
// caret and inline selections, leaving inline copy to Lexical's default handler.
function $populateClipboardFromSelection(
  editor: LexicalEditor,
  heads: ListItemNode[],
  selection: BaseSelection | null,
  event: ClipboardEvent | KeyboardEvent | null,
  operation: ClipboardOperation,
  sourceDocumentId: string
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
  const structuralNodes = $serializeStructuralHeads(heads);
  if (!structuralNodes) {
    return false;
  }
  payload.nodes = structuralNodes;
  if (operation === 'cut') {
    const sourceGap = $captureClipboardSourceGap(heads);
    payload.remdo = {
      sourceDocumentId,
      ...(sourceGap ? { sourceGap } : {}),
    };
  } else {
    // IDs help assemble a complete snapshot above, but copied notes represent
    // new content rather than existing identity. Keep the final payload free of
    // note identity so normal note creation owns ID initialization on paste.
    clearSerializedNoteIds(payload.nodes);
    delete payload.remdo;
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
// selection is not a non-empty note range (inline selections defer to
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

function $isSoleEmptyRootNote(item: ListItemNode, parentList: ListNode): boolean {
  return (
    $isRootNode(parentList.getParent()) &&
    getContentSiblings(parentList).length === 1 &&
    getNoteOwnText(item).length === 0 &&
    getBodyWrapper(item) === null &&
    !noteHasChildren(item)
  );
}

function $resolveClipboardSourceGap(
  selection: BaseSelection | null,
  sourceGap: RemDoClipboardSourceGap | undefined
): { parentList: ListNode; nextSibling: ListItemNode | null } | null {
  if (
    !$isRangeSelection(selection) ||
    !selection.isCollapsed() ||
    !sourceGap ||
    typeof sourceGap.noteId !== 'string'
  ) {
    return null;
  }

  const anchor = $findNoteById(sourceGap.noteId);
  if (!anchor) {
    return null;
  }

  const focusItem = resolveContentItemFromNode(selection.anchor.getNode());
  if (sourceGap.kind === 'first-child') {
    if (focusItem !== anchor || !isPointAtBoundary(selection.anchor, anchor, 'end')) {
      return null;
    }
    $autoExpandIfFolded(anchor);
    const parentList = $getOrCreateChildList(anchor);
    return { parentList, nextSibling: getFirstDescendantListItem(parentList) };
  }

  const parentList = anchor.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }

  if (sourceGap.kind === 'before') {
    if (focusItem !== anchor || !isPointAtBoundary(selection.anchor, anchor, 'start')) {
      return null;
    }
    return { parentList, nextSibling: anchor };
  }

  const previousTail = getSubtreeTail(anchor);
  if (focusItem !== previousTail || !isPointAtBoundary(selection.anchor, previousTail, 'end')) {
    return null;
  }
  return { parentList, nextSibling: getNextContentSibling(anchor) };
}

function $insertNodesAtSelection(
  editor: LexicalEditor,
  structuralRange: OutlineSelectionRange | null,
  selection: BaseSelection | null,
  nodes: LexicalNode[],
  sourceGap?: RemDoClipboardSourceGap
): boolean {
  if (nodes.length === 0) {
    return false;
  }

  let orderedHeads: ListItemNode[] = [];
  let parentList: ListNode | null = null;
  let nextSibling: LexicalNode | null = null;

  const resolvedSourceGap = $resolveClipboardSourceGap(selection, sourceGap);
  if (resolvedSourceGap) {
    parentList = resolvedSourceGap.parentList;
    nextSibling = resolvedSourceGap.nextSibling;
  } else if (structuralRange) {
    orderedHeads = $resolveStructuralDeletionHeads(structuralRange, selection);
    if (orderedHeads.length === 0) {
      return false;
    }
    const viewRootKey = getViewRoot(editor);
    const viewRootHead =
      viewRootKey === null ? null : orderedHeads.find((head) => head.getKey() === viewRootKey) ?? null;
    if (viewRootHead) {
      $autoExpandIfFolded(viewRootHead);
      parentList = $getOrCreateChildList(viewRootHead);
      nextSibling = getFirstDescendantListItem(parentList);
      const replacementHeads = orderedHeads.filter((head) => head !== viewRootHead);
      orderedHeads = replacementHeads.length > 0 ? replacementHeads : getContentSiblings(parentList);
    } else {
      const lastHead = orderedHeads.at(-1)!;
      const candidateParent = lastHead.getParent();
      if (!$isListNode(candidateParent)) {
        return false;
      }
      parentList = candidateParent;
      nextSibling = getNextContentSibling(lastHead);
    }
  } else if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
    if (!contentItem) {
      return false;
    }
    const candidateParent = contentItem.getParent();
    if (!$isListNode(candidateParent)) {
      return false;
    }
    parentList = candidateParent;
    if ($isSoleEmptyRootNote(contentItem, parentList)) {
      // Structural deletion keeps the document editable by creating one empty
      // root note. Pasting notes into an otherwise empty document replaces that
      // placeholder instead of leaving an extra blank note behind.
      orderedHeads = [contentItem];
      nextSibling = getNextContentSibling(contentItem);
    } else {
      const placement = resolveCaretPlacement(selection, contentItem);
      if (!placement) {
        return false;
      }
      const viewRootKey = getViewRoot(editor);
      const isViewRoot = viewRootKey !== null && contentItem.getKey() === viewRootKey;

      if (placement === 'start') {
        if (isViewRoot) {
          $autoExpandIfFolded(contentItem);
          parentList = $getOrCreateChildList(contentItem);
          nextSibling = getFirstDescendantListItem(parentList);
        } else {
          nextSibling = contentItem;
        }
      } else if (placement === 'middle') {
        if (isViewRoot) {
          const split = $splitContentItemAtSelection(contentItem, selection, 'first-child');
          const splitParent = split?.getParent();
          if (!split || !$isListNode(splitParent)) {
            return false;
          }
          parentList = splitParent;
          nextSibling = split;
        } else {
          const split = $splitContentItemAtSelection(contentItem, selection);
          if (!split) {
            return false;
          }
          nextSibling = split;
        }
      } else {
        if (isViewRoot) {
          $autoExpandIfFolded(contentItem);
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
export function ClipboardPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();
  const lastPasteSelectionRangeRef = useRef<OutlineSelectionRange | null>(null);
  const lastPasteProvenanceRef = useRef<RemDoClipboardProvenance | null>(null);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        COPY_COMMAND,
        (event) => {
          // For a whole-note (structural) selection, build the clipboard from the
          // selected notes so each note carries its body and sub-notes. Inline
          // selections fall through to Lexical's default text/rich-text copy.
          const context = $resolveStructuralClipboardContext(editor);
          if (!context) {
            return false;
          }
          return $populateClipboardFromSelection(
            editor,
            context.heads,
            context.selection,
            event,
            'copy',
            docId
          );
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CUT_COMMAND,
        (event) => {
          // Runs inside Lexical's command update context. Capture the selected
          // whole notes before deleting them through the semantic outline owner.
          const context = $resolveStructuralClipboardContext(editor);
          if (!context) {
            return false;
          }

          const populated = $populateClipboardFromSelection(
            editor,
            context.heads,
            context.selection,
            event,
            'cut',
            docId
          );
          if (!populated) {
            return false;
          }

          $addUpdateTag(CUT_TAG);
          return $deleteNotesInRange(editor, context.selectionRange);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
        (payload, dispatchEditor) => {
          if (dispatchEditor !== editor) {
            return false;
          }

          const provenance = lastPasteProvenanceRef.current;
          lastPasteProvenanceRef.current = null;

          $promoteLeadingClipboardChildren(payload.nodes);

          const pasteBody = $isRangeSelection(payload.selection)
            ? $getSelectionBody(payload.selection)
            : null;

          if (pasteBody && $isRangeSelection(payload.selection)) {
            lastPasteSelectionRangeRef.current = null;
            $insertClipboardNodesIntoBody(payload.selection, payload.nodes);
            return true;
          }

          const outlineSelection = editor.selection.get();
          const isInlineSelection =
            outlineSelection?.kind !== 'structural' && $isInlineSelectionWithinSingleNote(payload.selection);
          const selectionRange = $resolvePasteSelectionRange(
            editor,
            payload.selection,
            lastPasteSelectionRangeRef.current
          );
          // The cached range has now been consumed; clear it so it can't leak
          // into the next paste, regardless of which exit path below runs.
          lastPasteSelectionRangeRef.current = null;

          if (isInlineSelection && $isRangeSelection(payload.selection) && $hasClipboardBody(payload.nodes)) {
            // Retain the existing whole-payload plain-text form rather than merge bodies.
            const [firstLine, ...restLines] = $getPlainTextFromClipboardNodes(payload.nodes).split(NEWLINE_PATTERN);
            const inlineContentItem = resolveContentItemFromNode(payload.selection.anchor.getNode());
            payload.selection.insertText(firstLine ?? '');
            $insertFirstChildNotes(inlineContentItem, restLines);
            return true;
          }

          const hasNoteStructure = $extractClipboardListChildren(payload.nodes).length > 0;
          const insertNodes = $clipboardNodesToNotes(payload.nodes);
          const firstNote = insertNodes.find(isContentItem);

          if (!hasNoteStructure && insertNodes.length === 1 && !selectionRange && $isRangeSelection(payload.selection)) {
            payload.selection.removeText();
            $insertNodes(firstNote?.getChildren() ?? []);
            return true;
          }

          const canPreserveNoteIds = $canPreserveClipboardNoteIds(insertNodes, provenance, docId);
          if (!canPreserveNoteIds) {
            // Copy, foreign/legacy payloads, cross-document cuts, and colliding
            // cuts all create notes. Erase any supplied identity and let the
            // ordinary ListItemNode transform initialize IDs after insertion.
            $clearClipboardNoteIds(insertNodes);
          }

          if (isInlineSelection && $isRangeSelection(payload.selection)) {
            const inlineContentItem = resolveContentItemFromNode(payload.selection.anchor.getNode());
            if (firstNote && inlineContentItem) {
              payload.selection.removeText();
              $insertNodes(firstNote.getChildren());
              const remaining = insertNodes.slice(insertNodes.indexOf(firstNote) + 1);
              const firstChildList = isChildrenWrapper(remaining[0]) ? remaining[0].getFirstChild() : null;
              if ($isListNode(firstChildList)) {
                remaining.splice(0, 1, ...firstChildList.getChildren());
              }
              $insertFirstChildNodes(inlineContentItem, remaining);
              const lastNote = remaining.findLast(isContentItem);
              if (lastNote) $selectItemEdge(lastNote, 'end');
              return true;
            }
            const text = $getPlainTextFromClipboardNodes(payload.nodes);
            const lines = text.split(NEWLINE_PATTERN);
            const shouldInsertNotes = lines.length > 1;

            if (shouldInsertNotes) {
              const [firstLine, ...restLines] = lines;
              payload.selection.insertText(firstLine ?? '');
              $insertFirstChildNotes(inlineContentItem, restLines);
              return true;
            }

            const inlineNodes = $extractInlineClipboardNodes(payload.nodes);
            if (inlineNodes.length > 0) {
              $insertNodes(inlineNodes);
            } else {
              payload.selection.insertText(text);
            }
            return true;
          }

          const isSameDocumentCut = (
            provenance !== null
            && docId.length > 0
            && provenance.sourceDocumentId === docId
          );
          return $insertNodesAtSelection(
            editor,
            selectionRange,
            payload.selection,
            insertNodes,
            isSameDocumentCut ? provenance.sourceGap : undefined
          );
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
          lastPasteProvenanceRef.current = getClipboardProvenance(clipboardPayload);
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
              $addUpdateTag(PASTE_TAG);
              lastPasteSelectionRangeRef.current = null;
              event.preventDefault();
              return true;
            }
          }

          if (event.clipboardData.getData('text/html') || lines.length <= 1) {
            return false;
          }

          const selection = $getSelection();

          // A selection inside a body is rich text: paste the plain text into the
          // body, never as list nodes that break the outline. insertRawText turns
          // newlines into LineBreakNodes (the body's line representation that line
          // nav relies on), not literal "\n" inside a text node.
          if ($isRangeSelection(selection) && $getSelectionBody(selection)) {
            $addUpdateTag(PASTE_TAG);
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
            $addUpdateTag(PASTE_TAG);
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
  }, [editor, docId]);

  return null;
}
