import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';

import { reportInvariant } from '#client/editor/invariant';
import {
  $getNoteBodyFromNode,
  $getNoteForBody,
  $isSelectionWithinOneBody,
  $resolveNoteForSelectionPoint,
} from '#client/editor/features/note-body/note-body-ops';
import { isBodyWrapper } from '#client/editor/features/note-body/note-body-node';
import { getContentSiblings, isContentItem } from '../list-structure';
import { resolveContentItemFromNode } from '../schema';
import { getNextContentSibling, normalizeContentRange } from './tree';

// Returns the contiguous sibling slab that spans anchor/focus as the set of
// top-most selected heads (dropping descendants when an ancestor is selected).
// Returns an empty array when the selection cannot be normalized to a single sibling run.
export function $getContiguousSelectionHeads(selection: RangeSelection): ListItemNode[] {
  if (selection.isCollapsed()) {
    return [];
  }

  // A selection wholly inside one body is inline (the body is its own region, see
  // docs/outliner/body.md), so it has no structural head slab. Resolving its ends
  // would map both to the owner note and yield a spurious one-note structural
  // head, making structural callers (e.g. paste) act on the whole note.
  if ($isSelectionWithinOneBody(selection)) {
    return [];
  }

  const elementSelectionHeads = resolveElementSelectionHeads(selection);
  if (elementSelectionHeads) {
    return elementSelectionHeads;
  }

  const anchorItem = $resolveNoteForSelectionPoint(selection.anchor.getNode());
  const focusItem = $resolveNoteForSelectionPoint(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    reportInvariant({
      message: 'Selection anchor/focus is not within list items.',
      context: { hasAnchor: Boolean(anchorItem), hasFocus: Boolean(focusItem) },
    });
    return [];
  }

  const anchorContent = anchorItem;
  const focusContent = focusItem;

  if (
    anchorContent !== focusContent &&
    selection.anchor.type === 'element' &&
    selection.anchor.offset === 0 &&
    selection.focus.type === 'text' &&
    selection.focus.offset === 0 &&
    anchorContent.getTextContent().trim().length === 0 &&
    getNextContentSibling(anchorContent) === focusContent
  ) {
    return [anchorContent];
  }

  const normalized = normalizeContentRange(anchorContent, focusContent);

  const parent = normalized.start.getParent();
  if (!parent || parent !== normalized.end.getParent() || !$isListNode(parent)) {
    reportInvariant({
      message: 'Selection heads do not share a list parent.',
      context: {
        startKey: normalized.start.getKey(),
        endKey: normalized.end.getKey(),
        hasParent: Boolean(parent),
      },
    });
    return [];
  }

  const siblings = getContentSiblings(parent);
  const startIndex = siblings.indexOf(normalized.start);
  const endIndex = siblings.indexOf(normalized.end);
  if (startIndex === -1 || endIndex === -1) {
    reportInvariant({
      message: 'Selection heads are not found among content siblings.',
      context: {
        startKey: normalized.start.getKey(),
        endKey: normalized.end.getKey(),
        siblingCount: siblings.length,
      },
    });
    return [];
  }

  const first = Math.min(startIndex, endIndex);
  const last = Math.max(startIndex, endIndex);
  return siblings.slice(first, last + 1);
}

export function $getSelectedNotes(selection: RangeSelection): ListItemNode[] {
  const ordered: ListItemNode[] = [];
  const seen = new Set<string>();

  const candidates: LexicalNode[] = selection.getNodes();

  const pushNote = (note: ListItemNode) => {
    const key = note.getKey();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(note);
  };

  for (const node of candidates) {
    // A node inside a body belongs to that body's owner note (for selection the
    // body is part of its note); resolve to the owner rather than treat it as a
    // stray. A bare body-wrapper carries no note of its own.
    const body = $getNoteBodyFromNode(node);
    if (body) {
      const owner = $getNoteForBody(body);
      if (owner) {
        pushNote(owner);
      }
      continue;
    }
    if (isBodyWrapper(node)) {
      continue;
    }

    const contentItem = resolveContentItemFromNode(node);
    if (!contentItem) {
      reportInvariant({
        message: 'Selected node is not within a list item',
        context: { nodeType: node.getType() },
      });
      continue;
    }

    pushNote(contentItem);
  }

  return ordered;
}

function resolveElementSelectionHeads(selection: RangeSelection): ListItemNode[] | null {
  if (selection.anchor.type !== 'element' || selection.focus.type !== 'element') {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  const focusNode = selection.focus.getNode();
  if (anchorNode !== focusNode || !$isListNode(anchorNode)) {
    return null;
  }

  const start = Math.min(selection.anchor.offset, selection.focus.offset);
  const end = Math.max(selection.anchor.offset, selection.focus.offset);
  if (start === end) {
    return null;
  }

  const slice = anchorNode.getChildren().slice(start, end);
  const heads: ListItemNode[] = [];
  for (const child of slice) {
    if (isContentItem(child)) {
      heads.push(child);
    }
  }

  return heads.length > 0 ? heads : null;
}
