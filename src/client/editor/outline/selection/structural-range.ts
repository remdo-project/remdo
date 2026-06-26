import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';
import { $getSelectedNotes, $getContiguousSelectionHeads } from './heads';
import type { OutlineSelection, OutlineSelectionRange } from './model';
import { $resolveStructuralHeadsFromRange } from './range';
import { computeStructuralRangeFromHeads } from './resolve';
import { $resolveNoteForSelectionPoint } from '#client/editor/features/note-body/note-body-ops';

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

  let heads = $getContiguousSelectionHeads(selection);
  if (heads.length === 0 && selection.isCollapsed() && allowCollapsedSingleNote) {
    // A caret inside a body resolves to its owner note: the body travels with the
    // note through indent/outdent and reorder (docs/outliner/body.md), so those
    // note-level commands act on the owner when invoked from body text.
    const contentItem = $resolveNoteForSelectionPoint(selection.anchor.getNode());
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

  if (allowMultiNoteSelection && heads.length <= 1 && $getSelectedNotes(selection).length <= 1) {
    return null;
  }

  return computeStructuralRangeFromHeads(heads);
}
