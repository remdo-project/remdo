import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { indentNotesInRange, outdentNotesInRange } from '#client/editor/outline/note-ops';
import { $resolveZoomBoundaryRoot } from '#client/editor/outline/selection/boundary';
import { $resolveSelectedNoteRange } from './selected-note-range';

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const range = $resolveSelectedNoteRange(editor);
        if (!range) {
          return false;
        }

        event.preventDefault();
        const boundaryRoot = $resolveZoomBoundaryRoot(editor);

        if (event.shiftKey) {
          outdentNotesInRange(range, boundaryRoot);
        } else {
          indentNotesInRange(range, boundaryRoot);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
