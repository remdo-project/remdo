import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';

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

interface OutlineSelectionSnapshot {
  payload: SnapPayload | null;
  hasStructuralSelection: boolean;
  structuralRange: OutlineSelectionRange | null;
  outlineSelection: OutlineSelection | null;
  progression: ProgressiveSelectionState;
  unlock: ProgressiveUnlockState;
}

interface OutlineSelectionSnapshotInput {
  selection: BaseSelection | null;
  isProgressiveTagged: boolean;
  isSnapTagged: boolean;
  progression: ProgressiveSelectionState;
  unlock: ProgressiveUnlockState;
  initialProgression: ProgressiveSelectionState;
}

export function $computeOutlineSelectionSnapshot({
  selection,
  isProgressiveTagged,
  isSnapTagged,
  progression,
  unlock,
  initialProgression,
}: OutlineSelectionSnapshotInput): OutlineSelectionSnapshot {
  let payload: SnapPayload | null = null;
  let structuralRange: OutlineSelectionRange | null = null;
  let hasStructuralSelection = false;
  let outlineSelection: OutlineSelection | null = null;

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

  if (!$isRangeSelection(selection)) {
    return {
      payload,
      hasStructuralSelection,
      structuralRange,
      outlineSelection,
      progression: nextProgression,
      unlock: nextUnlock,
    };
  }

  const anchorItem = anchorSelectionItem ?? resolveSelectionPointItem(selection, selection.anchor);
  const focusItem = resolveSelectionPointItem(selection, selection.focus);
  const anchorKey = anchorItem ? anchorItem.getKey() : null;
  const focusKey = focusItem ? focusItem.getKey() : null;
  const isBackward = selection.isBackward();

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
  };
}

// resolveSelectionPointItem moved to selection/resolve.ts
