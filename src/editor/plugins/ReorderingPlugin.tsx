import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import { moveNotesDown, moveNotesUp, resolveRangeSelectionHeads } from '@/editor/outline/note-ops';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';

function $moveSelectionDown(boundaryRoot: ListItemNode | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const heads = resolveRangeSelectionHeads(selection);
  if (heads.length === 0) {
    return false;
  }

  return moveNotesDown(heads, boundaryRoot);
}

function $moveSelectionUp(boundaryRoot: ListItemNode | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const heads = resolveRangeSelectionHeads(selection);
  if (heads.length === 0) {
    return false;
  }

  return moveNotesUp(heads, boundaryRoot);
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $moveUp = () => {
      const boundaryRoot = $resolveZoomBoundaryRoot(editor);
      return $moveSelectionUp(boundaryRoot);
    };
    const $moveDown = () => {
      const boundaryRoot = $resolveZoomBoundaryRoot(editor);
      return $moveSelectionDown(boundaryRoot);
    };

    return mergeRegister(
      editor.registerCommand(REORDER_NOTES_UP_COMMAND, $moveUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(REORDER_NOTES_DOWN_COMMAND, $moveDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}
