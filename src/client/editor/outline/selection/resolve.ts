import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';
import { $getNodeByKey } from 'lexical';

import { reportInvariant } from '#client/editor/invariant';
import { $getNoteBodyFromNode, $getNoteForBody } from '#client/editor/features/note-body/note-body-ops';
import { getBodyWrapper, getPreviousContentSibling, isChildrenWrapper, isWrapperItem } from '#client/editor/outline/list-structure';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';

import { isPointAtBoundary } from './caret';
import { $getContiguousSelectionHeads } from './heads';
import type { OutlineSelectionRange } from './model';
import { isEmptyNoteBody } from './note-body';
import type { Direction, LadderState, Rung } from './rungs';
import { $replayLadder } from './rungs';
import { getNextContentSibling, getSubtreeTail, normalizeContentRange, sortHeadsByDocumentOrder } from './tree';

export interface SnapPayload {
  anchorKey: string;
  focusKey: string;
  anchorEdge: 'start' | 'end';
  focusEdge: 'start' | 'end';
}

// The ladder is the single source of truth for progressive selection state.
// `ProgressiveSelectionState` remains as an alias so existing call sites that
// only ever pass the state around keep typechecking.
export type ProgressiveSelectionState = LadderState;

export function $resolveSelectionPointItem(
  selection: RangeSelection,
  point: RangeSelection['anchor']
): ListItemNode | null {
  const pointNode = point.getNode();

  // A point inside a body resolves to the body's owner note: for selection the
  // body is part of its note, so a cross-region range snaps around the owner.
  const body = $getNoteBodyFromNode(pointNode);
  if (body) {
    return $getNoteForBody(body);
  }

  const direct = resolveContentItemFromNode(pointNode);
  if (direct) {
    const content = direct;
    const nextEmptySibling = resolveEmptySiblingFromBoundary(selection, point, pointNode, content);
    if (nextEmptySibling) {
      return nextEmptySibling;
    }

    return content;
  }

  if (point.type !== 'element') {
    return null;
  }

  const node = point.getNode();
  if (!$isListNode(node)) {
    return null;
  }

  const children = node.getChildren();
  if (children.length === 0) {
    return null;
  }

  const clampedIndex = Math.max(0, Math.min(point.offset, children.length - 1));
  const child = children[clampedIndex];
  if (!$isListItemNode(child)) {
    return null;
  }

  // An element point landing on a wrapper (children- or body-wrapper) resolves
  // to the content item that owns it.
  if (!isWrapperItem(child)) {
    return child;
  }
  const owner = getPreviousContentSibling(child);
  return owner ?? null;
}

function resolveEmptySiblingFromBoundary(
  selection: RangeSelection,
  point: RangeSelection['anchor'],
  pointNode: LexicalNode,
  contentItem: ListItemNode
): ListItemNode | null {
  const nextSibling = getNextContentSibling(contentItem);
  if (!nextSibling || !isEmptyNoteBody(nextSibling)) {
    return null;
  }
  const contentIsEmpty = isEmptyNoteBody(contentItem);

  if (selection.isCollapsed()) {
    if (!contentIsEmpty && point.type === 'element' && point.getNode() === contentItem) {
      const maxOffset = contentItem.getChildrenSize();
      if (point.offset >= maxOffset) {
        return nextSibling;
      }
      if (point.offset === 0) {
        return nextSibling;
      }
    }

    if ($isListItemNode(pointNode) && isChildrenWrapper(pointNode)) {
      return nextSibling;
    }
  }

  if (
    !selection.isCollapsed() &&
    point.type === 'element'
  ) {
    const anchorPoint = selection.anchor;
    const focusPoint = selection.focus;
    if ($isListItemNode(pointNode) && isChildrenWrapper(pointNode) && point.getNode() === pointNode) {
      return nextSibling;
    }

    if (
      !contentIsEmpty &&
      anchorPoint.type === 'element' &&
      focusPoint.type === 'element' &&
      anchorPoint.getNode() === contentItem &&
      focusPoint.getNode() === contentItem
    ) {
      const maxOffset = contentItem.getChildrenSize();
      const coversForward = anchorPoint.offset === 0 && focusPoint.offset >= maxOffset;
      const coversBackward = focusPoint.offset === 0 && anchorPoint.offset >= maxOffset;
      if (coversForward || coversBackward) {
        return nextSibling;
      }
    }
  }

  return null;
}

export function $selectionMatchesPayload(selection: RangeSelection, payload: SnapPayload): boolean {
  const anchorItem = $resolveSelectionPointItem(selection, selection.anchor);
  const focusItem = $resolveSelectionPointItem(selection, selection.focus);
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
    : $resolveSelectionPointItem(selection, selection.anchor);
  const focusNode = $resolveSelectionPointItem(selection, selection.focus);
  if (!anchorNode || !focusNode) {
    return null;
  }

  const anchorContent = anchorNode;
  const focusContent = focusNode;
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

  const caretItems = noteItems;
  const caretStartItem = caretItems[0]!;
  const caretEndItem = caretItems.at(-1)!;
  const tailItem = getSubtreeTail(caretEndItem);
  // The visual range must reach the tail note's body (a body-wrapper li renders
  // below the note), so the highlight/collapse range covers what a structural
  // delete removes — including a single note selected together with its body.
  const visualEndItem = getBodyWrapper(tailItem) ?? tailItem;

  return {
    headStartKey: caretStartItem.getKey(),
    headEndKey: caretEndItem.getKey(),
    caretStartKey: caretStartItem.getKey(),
    caretEndKey: caretEndItem.getKey(),
    visualStartKey: caretStartItem.getKey(),
    visualEndKey: visualEndItem.getKey(),
  } satisfies OutlineSelectionRange;
}

/**
 * Seed a rung ladder from a pointer-created (or pointer-tweaked) structural
 * selection so a subsequent Shift+Arrow continues — or reverses — the sweep from
 * the right place. We anchor at the selection's anchor note, then replay one
 * sweep step at a time (reusing $replayLadder so no traversal is duplicated)
 * until the replayed range reaches the far edge of the live selection. The
 * resulting stack is `[subtree, sibling×N]` in the inferred sweep direction, so
 * a following Shift+Arrow pops the last sibling exactly. Pointer note ranges are
 * always structural, so the inline rung (rung 1) is irrelevant and omitted.
 */
export function $inferPointerProgressionState(
  selection: RangeSelection,
  noteItems: ListItemNode[]
): ProgressiveSelectionState | null {
  const anchorItem = $resolveSelectionPointItem(selection, selection.anchor);
  if (!anchorItem) {
    return null;
  }
  const anchorContent = anchorItem;
  const heads = noteItems.length > 0 ? noteItems : $getContiguousSelectionHeads(selection);
  if (heads.length <= 1) {
    return null;
  }

  // Only seed a ladder for a same-level sibling range. Cross-level heads can't be
  // reached by sibling sweeps from the anchor's level, so seeding would exhaust
  // the replay loop and fall back to an anchor-subtree-only ladder that silently
  // drops the rest of the pointer selection. Bail instead and leave the existing
  // ladder untouched.
  const headParent = heads[0]!.getParent();
  if (!heads.every((head) => head.getParent() === headParent)) {
    return null;
  }

  const sorted = sortHeadsByDocumentOrder(heads);
  const rangeStartKey = sorted[0]!.getKey();
  const rangeEndKey = getSubtreeTail(sorted.at(-1)!).getKey();
  const anchorKey = anchorContent.getKey();

  // Sweep away from the anchor: if the anchor sits at the range's start, the
  // selection grew downward; otherwise treat it as an upward sweep.
  const direction: Direction = rangeStartKey === anchorKey ? 'down' : 'up';

  const rangeReachesFarEdge = (plan: ReturnType<typeof $replayLadder>): boolean => {
    if (!plan || plan.type !== 'range') {
      return false;
    }
    return direction === 'down' ? plan.endKey === rangeEndKey : plan.startKey === rangeStartKey;
  };

  // Start at the anchor subtree (rung 2); pointer note ranges are structural,
  // so the inline rung is irrelevant here.
  const stack: Rung[] = [{ kind: 'subtree' }];
  const MAX_STEPS = 64;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (rangeReachesFarEdge($replayLadder(anchorContent, stack))) {
      return { anchorKey, stack: [...stack], direction: stack.length > 1 ? direction : null };
    }
    stack.push({ kind: 'sibling', direction });
  }

  // Fall back to the anchor subtree so the selection still reads as structural.
  return { anchorKey, stack: [{ kind: 'subtree' }], direction: null };
}
