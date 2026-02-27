import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { indentNotes, outdentNotes } from '@/editor/outline/note-ops';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { $resolveSelectedNoteHeads } from './selected-note-heads';

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const heads = $resolveSelectedNoteHeads(editor);
        if (heads.length === 0) {
          return false;
        }

        event.preventDefault();
        const boundaryRoot = $resolveZoomBoundaryRoot(editor);

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
