import type { LexicalEditor } from 'lexical';
import { $getSelection } from 'lexical';
import type { OutlineSelectionRange } from './model';
import {
  $resolveStructuralRangeFromLexicalSelection,
  $resolveStructuralRangeFromOutlineSelection,
} from './structural-range';

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
