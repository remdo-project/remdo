import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { indentNotes, outdentNotes, resolveRangeSelectionHeads } from '@/editor/outline/note-ops';

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        // Only handle range selections (both collapsed and non-collapsed)
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const heads = resolveRangeSelectionHeads(selection);
        if (heads.length === 0) {
          return false;
        }

        const boundaryRoot = $resolveZoomBoundaryRoot(editor);
        event.preventDefault();

        if (event.shiftKey) {
          outdentNotes(heads, boundaryRoot);
        } else {
          indentNotes(heads, boundaryRoot);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
