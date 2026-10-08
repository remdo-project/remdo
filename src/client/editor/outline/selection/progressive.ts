import type { ListItemNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $getNodeByKey, $getSelection, $isElementNode, $isRangeSelection, $isTextNode } from 'lexical';
import { $getListItemByKey } from '#client/editor/outline/list-structure';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';

import { reportInvariant } from '#client/editor/foundation/invariant';

import { $applyCaretEdge, selectInlineContent, setSelectionBetweenItems } from './apply';
import type { ProgressiveSelectionState } from './resolve';
import { $resolveSelectionPointItem } from './resolve';
import {
  $createSubtreePlan,
  $replayLadder,
  emptyLadder,
  ladderHasStructuralRung,
  popStep,
  pushStep,
} from './rungs';
import type { InlineSelectionOrigin, ProgressivePlan } from './rungs';

interface ProgressiveSelectionRef {
  current: ProgressiveSelectionState;
}

// Empty ladder constant. `anchorKey: ''` is the canonical "no anchor yet"
// sentinel: it never equals a real Lexical node key, so the snapshot's
// anchor-match checks and the directional path's "continuing" check both
// treat it as a fresh start.
export const INITIAL_PROGRESSIVE_STATE: ProgressiveSelectionState = emptyLadder('');

export interface ProgressivePlanResult {
  plan: ProgressivePlan;
}

// Signals that the directional path popped past the bottom of the ladder and
// the selection should collapse to a caret at the anchor.
export interface DirectionalCollapseResult {
  collapse: true;
}

export interface DirectionalRestoreResult {
  restore: InlineSelectionOrigin;
  anchorKey: string;
}

// Signals that the press had no effect (same-direction press at a caret, or a
// growth push blocked by the document/zoom boundary). The ladder is unchanged.
export interface DirectionalNoopResult {
  noop: true;
}

function $resolveBoundaryRoot(boundaryKey: string | null | undefined): ListItemNode | null {
  if (!boundaryKey) {
    return null;
  }
  return $getListItemByKey(boundaryKey);
}

// Push one rung onto `base` and replay it. If the freshly pushed rung produced
// no plan because it was an empty inline rung (an empty note body has no inline
// boundary), push one more to reach the subtree rung — so growth never stalls on
// an empty body. Shared by the Shift+Arrow and Cmd/Ctrl+A growth paths.
function $growLadder(
  base: ProgressiveSelectionState,
  anchorContent: ListItemNode,
  direction: 'up' | 'down' | null,
  boundaryReplayKey: string | null
): { ladder: ProgressiveSelectionState; plan: ProgressivePlan | null } {
  let ladder = pushStep(base, direction);
  let plan = $replayLadder(anchorContent, ladder.stack, boundaryReplayKey);
  if (!plan && ladder.stack.length === 1) {
    ladder = pushStep(ladder, direction);
    plan = $replayLadder(anchorContent, ladder.stack, boundaryReplayKey);
  }
  return { ladder, plan };
}

function $captureLabelSelection(selection: RangeSelection, itemKey: string): InlineSelectionOrigin | undefined {
  if (
    resolveContentItemFromNode(selection.anchor.getNode())?.getKey() !== itemKey
    || resolveContentItemFromNode(selection.focus.getNode())?.getKey() !== itemKey
  ) {
    return undefined;
  }
  const capturePoint = ({ key, offset, type }: RangeSelection['anchor']) => ({ key, offset, type });
  return { anchor: capturePoint(selection.anchor), focus: capturePoint(selection.focus) };
}

function $resolveProgressionAnchorContent(
  selection: RangeSelection,
  progressionRef: ProgressiveSelectionRef,
  initialProgression: ProgressiveSelectionState,
  onMissingAnchor?: () => void
): ListItemNode | null {
  let resolvedAnchorItem: ListItemNode | null = null;
  if (selection.isCollapsed()) {
    resolvedAnchorItem = $resolveSelectionPointItem(selection, selection.anchor);
    const resolvedAnchorKey = resolvedAnchorItem ? resolvedAnchorItem.getKey() : null;
    const ladder = progressionRef.current;
    const isStructural = ladderHasStructuralRung(ladder);
    const shouldReset =
      !ladder.anchorKey ||
      !isStructural ||
      !resolvedAnchorKey ||
      ladder.anchorKey !== resolvedAnchorKey;
    if (shouldReset) {
      progressionRef.current = initialProgression;
    }
  }

  let anchorContent: ListItemNode | null = null;
  if (progressionRef.current.anchorKey) {
    anchorContent = $getListItemByKey(progressionRef.current.anchorKey);
  }

  if (!anchorContent) {
    const anchorItem = resolvedAnchorItem ?? $resolveSelectionPointItem(selection, selection.anchor);
    if (!anchorItem) {
      onMissingAnchor?.();
      progressionRef.current = initialProgression;
      return null;
    }
    anchorContent = anchorItem;
  }

  return anchorContent;
}

export function $computeProgressivePlan(
  progressionRef: ProgressiveSelectionRef,
  initialProgression: ProgressiveSelectionState,
  boundaryKey: string | null = null
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  const anchorContent = $resolveProgressionAnchorContent(selection, progressionRef, initialProgression, () => {
    reportInvariant({
      message: 'Directional plan could not find anchor list item',
    });
  });
  if (!anchorContent) {
    return null;
  }

  const anchorKey = anchorContent.getKey();
  const isContinuing = progressionRef.current.anchorKey === anchorKey;
  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);
  const boundaryReplayKey = boundaryRoot ? boundaryRoot.getKey() : null;

  // Select All grows without choosing an arrow direction. Its whole-group
  // sibling rungs retain that meaning during later directional replay.
  const base = isContinuing ? progressionRef.current : emptyLadder(anchorKey);
  const { ladder, plan } = $growLadder(base, anchorContent, null, boundaryReplayKey);

  if (!plan) {
    // The freshly pushed rung ran past the edge: either the zoom boundary or the
    // document root. Clamp to the maximum reachable selection so the handler still
    // claims the event instead of falling through to the default browser Cmd+A.
    // Keep the existing rungs without retaining the previous arrow direction.
    progressionRef.current = { ...base, direction: null };
    if (boundaryRoot) {
      // View boundary: clamp to the view root's subtree.
      return { plan: $createSubtreePlan(boundaryRoot) };
    } else {
      // Document root (no zoom): replay the last good ladder — the whole-document
      // note range the previous press already reached — so a further Cmd+A is a handled
      // no-op rather than a fall-through.
      const clampedPlan = $replayLadder(anchorContent, base.stack, boundaryReplayKey);
      if (clampedPlan) {
        return { plan: clampedPlan };
      }
    }
    return null;
  }

  progressionRef.current = ladder;
  return { plan };
}

/**
 * Plan directional entry, growth or contraction of the rung ladder.
 *
 * The ladder is the single source of truth. Growth (sweep direction, or any
 * direction before a sweep is set) pushes the next rung; contraction (opposite
 * of the recorded sweep direction) pops the top rung. Contracting past the
 * bottom of the stack restores the label selection that entered it, or collapses
 * to a caret for a select-all or pointer ladder.
 *
 * Returns a plan to apply, a collapse signal, a no-op signal, or null when the
 * selection/anchor cannot be resolved (caller resets the ladder).
 */
export function $computeDirectionalPlan(
  progressionRef: ProgressiveSelectionRef,
  direction: 'up' | 'down',
  initialProgression: ProgressiveSelectionState,
  boundaryKey: string | null = null
): ProgressivePlanResult | DirectionalCollapseResult | DirectionalRestoreResult | DirectionalNoopResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  const anchorContent = $resolveProgressionAnchorContent(selection, progressionRef, initialProgression);
  if (!anchorContent) {
    return null;
  }

  const anchorKey = anchorContent.getKey();
  const ladder = progressionRef.current;
  const isContinuing = ladder.anchorKey === anchorKey && ladder.stack.length > 0;
  const sweep = isContinuing ? ladder.direction : null;
  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);
  const boundaryReplayKey = boundaryRoot ? boundaryRoot.getKey() : null;

  // An arrow opposite to the last directional growth pops the top rung.
  // Select All leaves the sweep unset, so the first arrow grows either way.
  if (isContinuing && sweep !== null && direction !== sweep) {
    const next = popStep(ladder);
    const plan = $replayLadder(anchorContent, next.stack, boundaryReplayKey);
    if (!plan) {
      progressionRef.current = emptyLadder(anchorKey);
      // Nothing structural left to replay: the stack is empty, or holds only the
      // inline rung of an empty label.
      if (ladder.entrySelection && !ladderHasStructuralRung(next)) {
        return { restore: ladder.entrySelection, anchorKey };
      }
      return { collapse: true };
    }
    progressionRef.current = next;
    return { plan };
  }

  const base = isContinuing
    ? ladder
    : { ...emptyLadder(anchorKey), entrySelection: $captureLabelSelection(selection, anchorKey) };
  const { ladder: next, plan } = $growLadder(base, anchorContent, direction, boundaryReplayKey);

  if (!plan) {
    // Boundary push (past document/view root) — no-op, keep the current ladder.
    return { noop: true };
  }

  progressionRef.current = next;
  return { plan };
}

export function $restoreInlineSelection(result: DirectionalRestoreResult): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }
  for (const endpoint of ['anchor', 'focus'] as const) {
    const point = result.restore[endpoint];
    const node = $getNodeByKey(point.key);
    if (!node || resolveContentItemFromNode(node)?.getKey() !== result.anchorKey) {
      return $applyCaretEdge(result.anchorKey, 'start');
    }
    const size = $isTextNode(node) ? node.getTextContentSize() : $isElementNode(node) ? node.getChildrenSize() : 0;
    selection[endpoint].set(point.key, Math.min(point.offset, size), point.type);
  }
  selection.dirty = true;
  return true;
}

export function $applyProgressivePlan(result: ProgressivePlanResult): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  if (result.plan.type === 'inline') {
    const item = $getListItemByKey(result.plan.itemKey);
    if (!item) {
      return false;
    }
    return selectInlineContent(selection, item);
  }

  const startItem = $getListItemByKey(result.plan.startKey);
  const endItem = $getListItemByKey(result.plan.endKey);
  if (!startItem || !endItem) {
    return false;
  }

  return setSelectionBetweenItems(selection, startItem, endItem, 'content', 'subtree');
}
