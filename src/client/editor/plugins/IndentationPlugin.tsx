import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { indentNotesInRange, outdentNotesInRange } from '#client/editor/outline/note-ops';
import { $resolveZoomRoot } from '#client/editor/features/zoom/zoom-root';
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
        const zoomRoot = $resolveZoomRoot(editor);

        if (event.shiftKey) {
          outdentNotesInRange(range, zoomRoot);
        } else {
          indentNotesInRange(range, zoomRoot);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
