import type { ListItemNode } from '@lexical/list';
import type { BaseSelection } from 'lexical';
import { $getNodeByKey, $isRangeSelection } from 'lexical';

import { reportInvariant } from '#client/editor/invariant';

import type { OutlineSelection, OutlineSelectionRange } from './model';
import { getContiguousSelectionHeads, getSelectedNotes } from './heads';
import type { ProgressiveSelectionState, SnapPayload } from './resolve';
import {
  $createSnapPayload,
  computeStructuralRangeFromHeads,
  $inferPointerProgressionState,
  resolveSelectionPointItem,
  selectionMatchesPayload,
} from './resolve';
import { $replayLadder } from './rungs';
import type { ProgressivePlan } from './rungs';
import { getParentContentItem } from './tree';

export interface ProgressiveUnlockState {
  pending: boolean;
  reason: 'directional' | 'external';
}

// Structural intent is derived directly from the ladder: a ladder is
// structural when its stack carries any non-inline rung (subtree / sibling /
// hoist). A ladder whose only rung is inline, or an empty stack, is not
// structural.
function ladderHasStructuralRung(ladder: ProgressiveSelectionState): boolean {
  return ladder.stack.some((rung) => rung.kind !== 'inline');
}

// A re-replay plan the plugin must re-apply to the live Lexical selection so
// the DOM range follows a remote/undo/typing reshape (the snapshot itself runs
// in a read-only context and cannot mutate the selection).
export type StructuralReshape =
  | { kind: 'range'; plan: Extract<ProgressivePlan, { type: 'range' }> }
  | { kind: 'collapse' };

// Build an OutlineSelectionRange (sibling heads + subtree tail) from a replayed
// range plan. The plan's startKey is the start head; endKey is the subtree tail
// of the end head, so climb the tail up to the start head's sibling level to
// recover the end head.
function $rangeFromReplayPlan(
  plan: Extract<ProgressivePlan, { type: 'range' }>
): OutlineSelectionRange | null {
  const startHead = $getNodeByKey<ListItemNode>(plan.startKey);
  const tail = $getNodeByKey<ListItemNode>(plan.endKey);
  if (!startHead || !tail) {
    return null;
  }

  const startParent = startHead.getParent();
  let endHead: ListItemNode = tail;
  while (endHead.getParent() !== startParent) {
    const parent = getParentContentItem(endHead);
    if (!parent) {
      return null;
    }
    endHead = parent;
  }

  return computeStructuralRangeFromHeads([startHead, endHead]);
}

// Re-replay a structural ladder against the live tree and return the reshaped
// range plan plus the (possibly truncated) ladder. Returns null only when no
// non-empty prefix of the stack replays to a range (the caller treats that as a
// tier-4 collapse).
function $reshapeStructuralLadder(
  anchorItem: ListItemNode,
  ladder: ProgressiveSelectionState
): { plan: Extract<ProgressivePlan, { type: 'range' }>; ladder: ProgressiveSelectionState } | null {
  // Tier 1/2: the full stack still replays — the selection simply follows the
  // remote reshape (e.g. a swept subtree gaining a child).
  const full = $replayLadder(anchorItem, ladder.stack);
  if (full && full.type === 'range') {
    return { plan: full, ladder };
  }

  // Tier 3: a rung no longer resolves. Keep the longest stack PREFIX that still
  // replays to a range (drop the first failing rung and everything above it).
  for (let length = ladder.stack.length - 1; length >= 1; length -= 1) {
    const prefix = ladder.stack.slice(0, length);
    const plan = $replayLadder(anchorItem, prefix);
    if (plan && plan.type === 'range') {
      return { plan, ladder: { ...ladder, stack: prefix } };
    }
  }

  return null;
}

interface OutlineSelectionSnapshot {
  payload: SnapPayload | null;
  hasStructuralSelection: boolean;
  structuralRange: OutlineSelectionRange | null;
  outlineSelection: OutlineSelection | null;
  progression: ProgressiveSelectionState;
  unlock: ProgressiveUnlockState;
  reshape: StructuralReshape | null;
}

interface OutlineSelectionSnapshotInput {
  selection: BaseSelection | null;
  isProgressiveTagged: boolean;
  isSnapTagged: boolean;
  // True when the update mutated the tree (collaboration / undo-redo / typing),
  // as opposed to a selection-only change (e.g. Shift+Click). Only a tree change
  // re-replays an active structural ladder.
  treeChanged: boolean;
  progression: ProgressiveSelectionState;
  unlock: ProgressiveUnlockState;
  initialProgression: ProgressiveSelectionState;
}

export function $computeOutlineSelectionSnapshot({
  selection,
  isProgressiveTagged,
  isSnapTagged,
  treeChanged,
  progression,
  unlock,
  initialProgression,
}: OutlineSelectionSnapshotInput): OutlineSelectionSnapshot {
  let payload: SnapPayload | null = null;
  let structuralRange: OutlineSelectionRange | null = null;
  let hasStructuralSelection = false;
  let outlineSelection: OutlineSelection | null = null;
  let reshape: StructuralReshape | null = null;

  let nextProgression = progression;
  let nextUnlock = unlock;

  const resetProgression = () => {
    nextProgression = initialProgression;
  };

  const anchorSelectionItem = $isRangeSelection(selection)
    ? resolveSelectionPointItem(selection, selection.anchor)
    : null;
  const anchorSelectionKey = anchorSelectionItem ? anchorSelectionItem.getKey() : null;
  const isLadderStructural = ladderHasStructuralRung(nextProgression);
  const isCollapsedStructuralIntent =
    isProgressiveTagged &&
    $isRangeSelection(selection) &&
    selection.isCollapsed() &&
    anchorSelectionKey !== null &&
    isLadderStructural &&
    nextProgression.anchorKey === anchorSelectionKey;

  // Caret no-op memory: after contracting the ladder to a caret, the empty
  // stack retains the sweep direction so a further same-direction Shift+Arrow
  // is a no-op (stop-at-anchor). Keep that memory alive across plain caret
  // updates as long as the caret stays on the anchor note; it is cleared once
  // the caret moves (anchor change) or an explicit collapse resets the ladder.
  const isCaretMemory =
    nextProgression.stack.length === 0 &&
    nextProgression.direction !== null &&
    anchorSelectionKey !== null &&
    nextProgression.anchorKey === anchorSelectionKey;

  if (isProgressiveTagged) {
    nextUnlock = { ...nextUnlock, pending: false };
  } else if ($isRangeSelection(selection)) {
    if (
      !anchorSelectionKey ||
      (selection.isCollapsed() && !isCollapsedStructuralIntent && !isCaretMemory) ||
      nextProgression.anchorKey !== anchorSelectionKey
    ) {
      resetProgression();
      nextUnlock = { pending: false, reason: 'external' };
    }
  } else {
    resetProgression();
    nextUnlock = { pending: false, reason: 'external' };
  }

  // Collaboration / undo-redo / typing reshape: when an update we did NOT
  // originate carries an active structural ladder, re-replay the stored ladder
  // against the live tree so the selection follows remote tree changes instead
  // of drifting. The ladder is the single source of truth; the live selection
  // geometry is stale here. (Our own ladder commands are progressive-tagged and
  // skip this path.) A tier-4 anchor loss (the anchor note is gone) is already
  // handled above: the live anchor no longer resolves, so the ladder was reset.
  if (
    !isProgressiveTagged &&
    !isSnapTagged &&
    treeChanged &&
    $isRangeSelection(selection) &&
    ladderHasStructuralRung(nextProgression) &&
    nextProgression.anchorKey === anchorSelectionKey
  ) {
    const anchorContent = $getNodeByKey<ListItemNode>(nextProgression.anchorKey);
    if (!anchorContent) {
      // Tier 4: anchor id no longer resolves — reset and collapse to a caret.
      resetProgression();
      reshape = { kind: 'collapse' };
    } else {
      const reshaped = $reshapeStructuralLadder(anchorContent, nextProgression);
      if (reshaped) {
        // Tier 1/2 (full stack replays) or tier 3 (longest valid prefix).
        nextProgression = reshaped.ladder;
        reshape = { kind: 'range', plan: reshaped.plan };
        structuralRange = $rangeFromReplayPlan(reshaped.plan);
      } else {
        // No prefix replays even though the anchor is alive — collapse.
        resetProgression();
        reshape = { kind: 'collapse' };
      }
    }
  }

  if (!$isRangeSelection(selection)) {
    return {
      payload,
      hasStructuralSelection,
      structuralRange,
      outlineSelection,
      progression: nextProgression,
      unlock: nextUnlock,
      reshape,
    };
  }

  const anchorItem = anchorSelectionItem ?? resolveSelectionPointItem(selection, selection.anchor);
  const focusItem = resolveSelectionPointItem(selection, selection.focus);
  const anchorKey = anchorItem ? anchorItem.getKey() : null;
  const focusKey = focusItem ? focusItem.getKey() : null;
  const isBackward = selection.isBackward();

  // A reshape derived the structural state from the re-replayed ladder, not the
  // (stale) live selection geometry. Honor it directly and skip the live-head
  // derivation below — the plugin re-applies `reshape` to the live selection.
  if (reshape) {
    if (reshape.kind === 'range' && structuralRange) {
      hasStructuralSelection = true;
      outlineSelection = {
        kind: 'structural',
        stage: nextProgression.stack.length > 0 ? nextProgression.stack.length : 2,
        anchorKey: nextProgression.anchorKey,
        focusKey,
        range: structuralRange,
        isBackward,
      };
    } else {
      // Collapse (tier 4 / unresolvable): fall back to a caret on the anchor.
      structuralRange = null;
      outlineSelection = {
        kind: 'caret',
        stage: 0,
        anchorKey,
        focusKey,
        range: null,
        isBackward,
      };
    }

    return {
      payload,
      hasStructuralSelection,
      structuralRange,
      outlineSelection,
      progression: nextProgression,
      unlock: nextUnlock,
      reshape,
    };
  }

  if (selection.isCollapsed() && !isCollapsedStructuralIntent) {
    outlineSelection = {
      kind: 'caret',
      stage: 0,
      anchorKey,
      focusKey,
      range: null,
      isBackward,
    };

    return {
      payload,
      hasStructuralSelection,
      structuralRange,
      outlineSelection,
      progression: nextProgression,
      unlock: nextUnlock,
      reshape,
    };
  }

  const headItems = selection.isCollapsed() ? (anchorItem ? [anchorItem] : []) : getContiguousSelectionHeads(selection);
  structuralRange = computeStructuralRangeFromHeads(headItems);
  if (headItems.length > 0 && !structuralRange) {
    reportInvariant({
      message: 'Structural range missing despite non-empty heads',
      context: { headCount: headItems.length },
    });
  }

  const hasMultiNoteRange = headItems.length > 1;
  const hasMultiNoteSelection = getSelectedNotes(selection).length > 1;
  // Structural intent comes from the ladder (single source of truth); the
  // multi-note checks cover pointer selections that have not yet seeded one.
  const isProgressiveStructural = ladderHasStructuralRung(nextProgression);
  const hasStructuralIntent = isProgressiveStructural || hasMultiNoteRange || hasMultiNoteSelection;
  hasStructuralSelection = hasStructuralIntent && structuralRange !== null;
  if (!isProgressiveStructural && hasMultiNoteRange) {
    const inferredProgression = $inferPointerProgressionState(selection, headItems);
    if (inferredProgression) {
      nextProgression = inferredProgression;
    }
  }

  const overrideAnchorKey = ladderHasStructuralRung(nextProgression) ? nextProgression.anchorKey : null;

  if (!isSnapTagged && headItems.length >= 2) {
    const candidate = $createSnapPayload(selection, headItems, overrideAnchorKey);
    if (candidate && !selectionMatchesPayload(selection, candidate)) {
      payload = candidate;
    }
  }

  const stage = nextProgression.stack.length > 0 ? nextProgression.stack.length : hasStructuralSelection ? 2 : 1;

  outlineSelection = {
    kind: hasStructuralSelection ? 'structural' : 'inline',
    stage,
    anchorKey,
    focusKey,
    range: hasStructuralSelection ? structuralRange : null,
    isBackward,
  };

  return {
    payload,
    hasStructuralSelection,
    structuralRange,
    outlineSelection,
    progression: nextProgression,
    unlock: nextUnlock,
    reshape,
  };
}

// resolveSelectionPointItem moved to selection/resolve.ts
