import type { ListItemNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical';

import { reportInvariant } from '#client/editor/invariant';

import { selectInlineContent, selectNoteBody, setSelectionBetweenItems } from './apply';
import type { ProgressiveSelectionState } from './resolve';
import { resolveSelectionPointItem } from './resolve';
import {
  $createSubtreePlan,
  $replayLadder,
  emptyLadder,
  ladderHasStructuralRung,
  popStep,
  pushStep,
} from './rungs';
import type { ProgressivePlan } from './rungs';

interface ProgressiveSelectionRef {
  current: ProgressiveSelectionState;
}

// Empty ladder constant. `anchorKey: ''` is the canonical "no anchor yet"
// sentinel: it never equals a real Lexical node key, so the snapshot's
// anchor-match checks and the directional path's "continuing" check both
// treat it as a fresh start.
export const INITIAL_PROGRESSIVE_STATE: ProgressiveSelectionState = emptyLadder('');

export interface ProgressivePlanResult {
  anchorKey: string;
  plan: ProgressivePlan;
}

// Signals that the directional path popped past the bottom of the ladder and
// the selection should collapse to a caret at the anchor.
export interface DirectionalCollapseResult {
  collapse: true;
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
  const node = $getNodeByKey<ListItemNode>(boundaryKey);
  if (!node) {
    return null;
  }
  return node;
}

// Push one rung onto `base` and replay it. If the freshly pushed rung produced
// no plan because it was an empty inline rung (an empty note body has no inline
// boundary), push one more to reach the subtree rung — so growth never stalls on
// an empty body. Shared by the Shift+Arrow and Cmd/Ctrl+A growth paths.
function $growLadder(
  base: ProgressiveSelectionState,
  anchorContent: ListItemNode,
  direction: 'up' | 'down',
  boundaryReplayKey: string | null,
  slab: boolean
): { ladder: ProgressiveSelectionState; plan: ProgressivePlan | null } {
  let ladder = pushStep(base, direction);
  let plan = $replayLadder(anchorContent, ladder.stack, boundaryReplayKey, slab);
  if (!plan && ladder.stack.length === 1) {
    ladder = pushStep(ladder, direction);
    plan = $replayLadder(anchorContent, ladder.stack, boundaryReplayKey, slab);
  }
  return { ladder, plan };
}

function $resolveProgressionAnchorContent(
  selection: RangeSelection,
  progressionRef: ProgressiveSelectionRef,
  initialProgression: ProgressiveSelectionState,
  onMissingAnchor?: () => void
): ListItemNode | null {
  let resolvedAnchorItem: ListItemNode | null = null;
  if (selection.isCollapsed()) {
    resolvedAnchorItem = resolveSelectionPointItem(selection, selection.anchor);
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
    const storedAnchor = $getNodeByKey<ListItemNode>(progressionRef.current.anchorKey);
    if (storedAnchor) {
      anchorContent = storedAnchor;
    }
  }

  if (!anchorContent) {
    const anchorItem = resolvedAnchorItem ?? resolveSelectionPointItem(selection, selection.anchor);
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

  // Cmd+A is direction-neutral: it only ever grows the ladder outward, and its
  // slab rung selects the whole sibling group regardless of direction. So it
  // always pushes in the canonical 'down' direction — it never inherits a prior
  // Shift+Arrow sweep, and never leaves an 'up' bias that would make a following
  // Shift+Arrow read as contraction. Start from a down-oriented base when
  // continuing, or an empty ladder on a fresh anchor.
  const base = isContinuing ? { ...progressionRef.current, direction: 'down' as const } : emptyLadder(anchorKey);
  const { ladder, plan } = $growLadder(base, anchorContent, 'down', boundaryReplayKey, true);

  if (!plan) {
    // Replay blocked by the zoom boundary or document root. Clamp to the zoom
    // root's subtree so the handler stays at the maximum reachable selection
    // instead of falling through to the default browser Cmd+A. Leave the ladder
    // unchanged (don't persist the blocked rung).
    if (boundaryRoot) {
      const clampedPlan = $createSubtreePlan(boundaryRoot);
      if (clampedPlan) {
        return { anchorKey, plan: clampedPlan };
      }
    }
    return null;
  }

  progressionRef.current = ladder;
  return { anchorKey, plan };
}

/**
 * Route a Shift+Arrow press through the rung ladder (push/pop + replay).
 *
 * The ladder is the single source of truth. Growth (sweep direction, or any
 * direction before a sweep is set) pushes the next rung; contraction (opposite
 * of the recorded sweep direction) pops the top rung. Contracting past the
 * bottom of the stack collapses to a caret. A same-direction press once the
 * ladder is back at a caret is a no-op (stop-at-anchor, never flip).
 *
 * Returns a plan to apply, a collapse signal, a no-op signal, or null when the
 * selection/anchor cannot be resolved (caller resets the ladder).
 */
export function $computeDirectionalPlan(
  progressionRef: ProgressiveSelectionRef,
  direction: 'up' | 'down',
  initialProgression: ProgressiveSelectionState,
  boundaryKey: string | null = null
): ProgressivePlanResult | DirectionalCollapseResult | DirectionalNoopResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  // Once a ladder has contracted to a bare caret it is fully reset (see the
  // collapse branch below): there is no caret "direction memory". A Shift+Arrow
  // on a collapsed caret therefore always starts a fresh ladder in the pressed
  // direction — Up grows up, Down grows down — matching plain text selection
  // (anchor+focus) once you are back at the caret. The "no flip" rule applies
  // only while a structural selection still exists (reversal pops toward the
  // anchor), not after collapse.

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

  // Contraction: a press opposite to the direction the ladder was grown pops the
  // top rung. This works from any rung (including the direction-neutral inline /
  // subtree rungs at the bottom) because `direction` is the growth direction,
  // recorded on every push and preserved by popStep until the stack is empty.
  if (isContinuing && sweep !== null && direction !== sweep) {
    const next = popStep(ladder);
    // Popped back to a bare caret: reset fully so the next Shift+Arrow starts a
    // fresh ladder in the pressed direction ("flip" once back at the caret).
    if (next.stack.length === 0) {
      progressionRef.current = emptyLadder(anchorKey);
      return { collapse: true, anchorKey };
    }
    const plan = $replayLadder(anchorContent, next.stack, boundaryReplayKey);
    if (!plan) {
      progressionRef.current = emptyLadder(anchorKey);
      return { collapse: true, anchorKey };
    }
    progressionRef.current = next;
    return { anchorKey, plan };
  }

  // Growth: push the next rung (fresh ladder when not continuing).
  const base = isContinuing ? ladder : emptyLadder(anchorKey);
  const { ladder: next, plan } = $growLadder(base, anchorContent, direction, boundaryReplayKey, false);

  if (!plan) {
    // Boundary push (past document/zoom root) — no-op, keep the current ladder.
    return { noop: true };
  }

  progressionRef.current = next;
  return { anchorKey, plan };
}

export function $applyProgressivePlan(result: ProgressivePlanResult): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  if (result.plan.type === 'inline') {
    const item = $getNodeByKey<ListItemNode>(result.plan.itemKey);
    if (!item) {
      return false;
    }
    if (!selectInlineContent(selection, item)) {
      return selectNoteBody(selection, item);
    }
    return true;
  }

  const startItem = $getNodeByKey<ListItemNode>(result.plan.startKey);
  const endItem = $getNodeByKey<ListItemNode>(result.plan.endKey);
  if (!startItem || !endItem) {
    return false;
  }

  return setSelectionBetweenItems(selection, startItem, endItem, result.plan.startMode, result.plan.endMode);
}

