import type { ListItemNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $getNodeByKey } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';

import { isPointAtBoundary } from './caret';
import { getContiguousSelectionHeads } from './heads';
import type { OutlineSelectionRange } from './model';
import { getSubtreeTail, normalizeContentRange } from './tree';

export interface SnapPayload {
  anchorKey: string;
  focusKey: string;
  anchorEdge: 'start' | 'end';
  focusEdge: 'start' | 'end';
}

export interface ProgressiveSelectionState {
  anchorKey: string | null;
  stage: number;
  locked: boolean;
}

export function selectionMatchesPayload(selection: RangeSelection, payload: SnapPayload): boolean {
  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    return false;
  }

  if (anchorItem.getKey() !== payload.anchorKey || focusItem.getKey() !== payload.focusKey) {
    return false;
  }

  return (
    isPointAtBoundary(selection.anchor, anchorItem, payload.anchorEdge) &&
    isPointAtBoundary(selection.focus, focusItem, payload.focusEdge)
  );
}

export function $createSnapPayload(
  selection: RangeSelection,
  items: ListItemNode[],
  overrideAnchorKey?: string | null
): SnapPayload | null {
  if (items.length === 0) {
    return null;
  }

  const anchorNode = overrideAnchorKey
    ? $getNodeByKey<ListItemNode>(overrideAnchorKey)
    : findNearestListItem(selection.anchor.getNode());
  const focusNode = findNearestListItem(selection.focus.getNode());
  if (!anchorNode || !focusNode) {
    return null;
  }

  const anchorContent = getContentListItem(anchorNode);
  const focusContent = getContentListItem(focusNode);
  const normalizedRange = normalizeContentRange(anchorContent, focusContent);
  const startContent = normalizedRange.start;
  const endContent = normalizedRange.end;
  const isBackward = selection.isBackward();
  const structuralStart = startContent;
  const structuralEnd = getSubtreeTail(endContent);
  const anchorBoundary = isBackward ? structuralEnd : structuralStart;
  const focusBoundary = isBackward ? structuralStart : structuralEnd;

  return {
    anchorKey: anchorBoundary.getKey(),
    focusKey: focusBoundary.getKey(),
    anchorEdge: isBackward ? 'end' : 'start',
    focusEdge: isBackward ? 'start' : 'end',
  } satisfies SnapPayload;
}

export function computeStructuralRangeFromHeads(heads: ListItemNode[]): OutlineSelectionRange | null {
  const noteItems = heads;
  if (noteItems.length === 0) {
    reportInvariant({
      message: 'Structural range computed with no heads',
    });
    return null;
  }

  const caretItems = noteItems.map((item) => getContentListItem(item));
  const caretStartItem = caretItems[0]!;
  const caretEndItem = caretItems.at(-1)!;
  const visualEndItem = getSubtreeTail(caretEndItem);

  return {
    caretStartKey: caretStartItem.getKey(),
    caretEndKey: caretEndItem.getKey(),
    visualStartKey: caretStartItem.getKey(),
    visualEndKey: visualEndItem.getKey(),
  } satisfies OutlineSelectionRange;
}

export function inferPointerProgressionState(
  selection: RangeSelection,
  noteItems: ListItemNode[]
): ProgressiveSelectionState | null {
  const anchorItem = findNearestListItem(selection.anchor.getNode());
  if (!anchorItem) {
    return null;
  }
  const anchorContent = getContentListItem(anchorItem);
  const heads = noteItems.length > 0 ? noteItems : getContiguousSelectionHeads(selection);
  if (heads.length <= 1) {
    return null;
  }
  const firstParent = heads[0]!.getParent();
  if (!heads.every((head: ListItemNode) => head.getParent() === firstParent)) {
    return null;
  }

  return {
    anchorKey: anchorContent.getKey(),
    stage: 3,
    locked: true,
  };
}
