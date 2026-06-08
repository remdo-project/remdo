import type { LexicalEditor } from 'lexical';
import { $getSelection } from 'lexical';
import type { OutlineSelectionRange } from '@/client/editor/outline/selection/model';
import {
  $resolveStructuralRangeFromLexicalSelection,
  $resolveStructuralRangeFromOutlineSelection,
} from '@/client/editor/outline/selection/structural-range';

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
