import type { BaseSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';
import { $getSelectedNotes, $getContiguousSelectionHeads } from './heads';
import type { OutlineSelection, OutlineSelectionRange } from './model';
import { $resolveStructuralHeadsFromRange } from './range';
import { computeStructuralRangeFromHeads } from './resolve';
import { $isSelectionWithinOneBody, $resolveNoteForSelectionPoint } from '#client/editor/outline/selection/body-region';

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
  if (
    heads.length === 0 &&
    allowCollapsedSingleNote &&
    (selection.isCollapsed() || $isSelectionWithinOneBody(selection))
  ) {
    // A caret or inline text selection inside a body resolves to its owner note:
    // the body travels with the note through indent/outdent and reorder
    // (docs/specs/outliner/body.md), so those note-level commands act on the
    // owner when invoked from body text. A body-local inline selection yields no
    // heads of its own by design — heads stay empty so paste edits the body
    // instead of replacing the note — hence the explicit recovery here.
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
