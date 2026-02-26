import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { COMMAND_PRIORITY_LOW } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import { moveNotesDown, moveNotesUp } from '@/editor/outline/note-ops';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { $resolveSelectedNoteHeads } from './selected-note-heads';

type MoveDirection = 'up' | 'down';

function $moveSelection(
  editor: LexicalEditor,
  direction: MoveDirection
): boolean {
  const heads = $resolveSelectedNoteHeads(editor);
  if (heads.length === 0) {
    return false;
  }
  const boundaryRoot = $resolveZoomBoundaryRoot(editor);
  return direction === 'up' ? moveNotesUp(heads, boundaryRoot) : moveNotesDown(heads, boundaryRoot);
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $moveUp = () => $moveSelection(editor, 'up');
    const $moveDown = () => $moveSelection(editor, 'down');

    return mergeRegister(
      editor.registerCommand(REORDER_NOTES_UP_COMMAND, $moveUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(REORDER_NOTES_DOWN_COMMAND, $moveDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}
