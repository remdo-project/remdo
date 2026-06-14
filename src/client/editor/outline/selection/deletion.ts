import type { ListItemNode } from '@lexical/list';
import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';
import { getPreviousContentSibling } from '../list-structure';
import { isWithinZoomBoundary } from './boundary';
import { getContiguousSelectionHeads } from './heads';
import type { OutlineSelectionRange } from './model';
import { $resolveStructuralHeadsFromRange } from './range';
import {
  getParentContentItem,
  getNextContentSibling,
  getSubtreeTail,
  removeNoteHeads,
  sortHeadsByDocumentOrder,
} from './tree';

interface StructuralDeletionCaretPlan {
  target: ListItemNode;
  edge: 'start' | 'end';
}

interface StructuralDeletionTargets {
  heads: ListItemNode[];
  caretPlan: StructuralDeletionCaretPlan | null;
}

export function $resolveStructuralDeletionHeads(
  range: OutlineSelectionRange,
  selection: BaseSelection | null
): ListItemNode[] {
  const fromRange = $resolveStructuralHeadsFromRange(range);
  if (fromRange.length > 0) {
    return sortHeadsByDocumentOrder(fromRange);
  }

  if (!$isRangeSelection(selection)) {
    return [];
  }

  return sortHeadsByDocumentOrder(getContiguousSelectionHeads(selection));
}

export function $resolveStructuralDeletionTargets(
  range: OutlineSelectionRange,
  selection: BaseSelection | null,
  boundaryRoot: ListItemNode | null
): StructuralDeletionTargets | null {
  const heads = $resolveStructuralDeletionHeads(range, selection);
  if (heads.length === 0) {
    return null;
  }

  const lastHead = heads.at(-1)!;
  const nextSibling = getNextContentSibling(lastHead);
  if (nextSibling && isWithinZoomBoundary(nextSibling, boundaryRoot)) {
    return {
      heads,
      caretPlan: { target: nextSibling, edge: 'start' },
    };
  }

  const firstHead = heads[0]!;
  const previousSibling = getPreviousContentSibling(firstHead);
  if (previousSibling && isWithinZoomBoundary(previousSibling, boundaryRoot)) {
    return {
      heads,
      caretPlan: { target: getSubtreeTail(previousSibling), edge: 'end' },
    };
  }

  const parentNote = getParentContentItem(firstHead);
  if (parentNote && isWithinZoomBoundary(parentNote, boundaryRoot)) {
    return {
      heads,
      caretPlan: { target: parentNote, edge: 'end' },
    };
  }

  return {
    heads,
    caretPlan: null,
  };
}

export function applyStructuralDeletionTargets(targets: StructuralDeletionTargets): boolean {
  return removeNoteHeads(targets.heads);
}
