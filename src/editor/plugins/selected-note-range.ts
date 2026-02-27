import type { LexicalEditor } from 'lexical';
import { $getSelection } from 'lexical';
import type { OutlineSelectionRange } from '@/editor/outline/selection/model';
import {
  $resolveStructuralRangeFromLexicalSelection,
  $resolveStructuralRangeFromOutlineSelection,
} from '@/editor/outline/selection/structural-range';

export function $resolveSelectedNoteRange(editor: LexicalEditor): OutlineSelectionRange | null {
  const outlineRange = $resolveStructuralRangeFromOutlineSelection(editor.selection.get());
  if (outlineRange) {
    return outlineRange;
  }

  return $resolveStructuralRangeFromLexicalSelection(
    $getSelection(),
    { allowCollapsedSingleNote: true }
  );
}
