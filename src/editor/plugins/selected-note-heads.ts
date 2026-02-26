import type { ListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getSelection, $isRangeSelection } from 'lexical';
import { resolveRangeSelectionHeads } from '@/editor/outline/note-ops';
import { $resolveStructuralHeadsFromRange } from '@/editor/outline/selection/range';

export function $resolveSelectedNoteHeads(editor: LexicalEditor): ListItemNode[] {
  if (editor.selection.isStructural()) {
    const range = editor.selection.get()?.range;
    if (range) {
      const heads = $resolveStructuralHeadsFromRange(range);
      if (heads.length > 0) {
        return heads;
      }
    }
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return [];
  }
  return resolveRangeSelectionHeads(selection);
}
