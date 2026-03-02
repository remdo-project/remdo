import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';
import { getSelectedNotes, getContiguousSelectionHeads } from './heads';
import type { OutlineSelection, OutlineSelectionRange } from './model';
import { $resolveStructuralHeadsFromRange } from './range';
import { computeStructuralRangeFromHeads } from './resolve';
import { resolveContentItemFromNode } from '../schema';

interface ResolveStructuralRangeOptions {
  allowCollapsedSingleNote?: boolean;
  requireMultipleHeads?: boolean;
  allowMultiNoteSelection?: boolean;
}

export function $resolveStructuralRangeFromOutlineSelection(
  outlineSelection: OutlineSelection | null
): OutlineSelectionRange | null {
  if (outlineSelection?.kind !== 'structural' || !outlineSelection.range) {
    return null;
  }
  return $resolveStructuralHeadsFromRange(outlineSelection.range).length > 0 ? outlineSelection.range : null;
}

export function $resolveStructuralRangeFromLexicalSelection(
  selection: BaseSelection | null,
  {
    allowCollapsedSingleNote = false,
    requireMultipleHeads = false,
    allowMultiNoteSelection = false,
  }: ResolveStructuralRangeOptions = {}
): OutlineSelectionRange | null {
  if (!$isRangeSelection(selection)) {
    return null;
  }

  let heads = getContiguousSelectionHeads(selection);
  if (heads.length === 0 && selection.isCollapsed() && allowCollapsedSingleNote) {
    const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
    if (contentItem) {
      heads = [contentItem];
    }
  }
  if (heads.length === 0) {
    return null;
  }

  if (requireMultipleHeads && heads.length < 2) {
    return null;
  }

  if (allowMultiNoteSelection && heads.length <= 1 && getSelectedNotes(selection).length <= 1) {
    return null;
  }

  return computeStructuralRangeFromHeads(heads);
}
