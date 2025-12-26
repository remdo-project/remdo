import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { findNearestListItem, getContentListItem, getContentSiblings, isChildrenWrapper } from '../list-structure';
import { getNextContentSibling, normalizeContentRange } from './tree';

// Returns the contiguous sibling slab that spans anchor/focus as the set of
// top-most selected heads (dropping descendants when an ancestor is selected).
// Returns an empty array when the selection cannot be normalized to a single sibling run.
export function getContiguousSelectionHeads(selection: RangeSelection): ListItemNode[] {
  if (selection.isCollapsed()) {
    return [];
  }

  const elementSelectionHeads = resolveElementSelectionHeads(selection);
  if (elementSelectionHeads) {
    return elementSelectionHeads;
  }

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    reportInvariant({
      message: 'Selection anchor/focus is not within list items.',
      context: { hasAnchor: Boolean(anchorItem), hasFocus: Boolean(focusItem) },
    });
    return [];
  }

  const anchorContent = getContentListItem(anchorItem);
  const focusContent = getContentListItem(focusItem);

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
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      heads.push(child);
    }
  }

  return heads.length > 0 ? heads : null;
}
