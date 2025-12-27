import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';

import type { OutlineSelection, OutlineSelectionRange } from './model';
import { getContiguousSelectionHeads } from './heads';
import type { ProgressiveSelectionState, SnapPayload } from './resolve';
import {
  $createSnapPayload,
  computeStructuralRangeFromHeads,
  inferPointerProgressionState,
  selectionMatchesPayload,
} from './resolve';

export interface ProgressiveUnlockState {
  pending: boolean;
  reason: 'directional' | 'external';
}

export interface OutlineSelectionSnapshot {
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
  let noteKeys: string[] = [];
  let hasStructuralSelection = false;
  let outlineSelection: OutlineSelection | null = null;

  let nextProgression = progression;
  let nextUnlock = unlock;

  const resetProgression = () => {
    nextProgression = initialProgression;
  };

  if (isProgressiveTagged) {
    const isLocked = $isRangeSelection(selection) && !selection.isCollapsed();
    nextProgression = { ...nextProgression, locked: isLocked };
    nextUnlock = { ...nextUnlock, pending: false };
  } else if ($isRangeSelection(selection)) {
    const anchorItem = findNearestListItem(selection.anchor.getNode());
    const anchorKey = anchorItem ? getContentListItem(anchorItem).getKey() : null;
    if (!anchorKey || selection.isCollapsed() || nextProgression.anchorKey !== anchorKey) {
      if (!nextUnlock.pending || nextUnlock.reason !== 'directional') {
        resetProgression();
      }
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

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  const anchorKey = anchorItem ? getContentListItem(anchorItem).getKey() : null;
  const focusKey = focusItem ? getContentListItem(focusItem).getKey() : null;
  const isBackward = selection.isBackward();

  if (selection.isCollapsed()) {
    outlineSelection = {
      kind: 'caret',
      stage: 0,
      anchorKey,
      focusKey,
      headKeys: [],
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

  const heads = getContiguousSelectionHeads(selection);
  const noteItems = heads;
  noteKeys = noteItems.map((item) => getContentListItem(item).getKey());
  structuralRange = computeStructuralRangeFromHeads(noteItems);
  if (noteItems.length > 0 && !structuralRange) {
    reportInvariant({
      message: 'Structural range missing despite non-empty heads',
      context: { headCount: noteItems.length },
    });
  }

  const hasMultiNoteRange = noteItems.length > 1;
  const isProgressiveStructural = nextProgression.locked && nextProgression.stage >= 2;
  hasStructuralSelection = isProgressiveStructural || hasMultiNoteRange;
  if (!nextProgression.locked && hasMultiNoteRange) {
    const inferredProgression = inferPointerProgressionState(selection, noteItems);
    if (inferredProgression) {
      nextProgression = inferredProgression;
    }
  }

  const overrideAnchorKey =
    nextProgression.locked && nextProgression.stage >= 2 ? nextProgression.anchorKey : null;

  if (!isSnapTagged && noteItems.length >= 2) {
    const candidate = $createSnapPayload(selection, noteItems, overrideAnchorKey);
    if (candidate && !selectionMatchesPayload(selection, candidate)) {
      payload = candidate;
    }
  }

  const stage = nextProgression.locked ? nextProgression.stage : hasStructuralSelection ? 2 : 1;

  outlineSelection = {
    kind: hasStructuralSelection ? 'structural' : 'inline',
    stage,
    anchorKey,
    focusKey,
    headKeys: hasStructuralSelection ? noteKeys : [],
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
