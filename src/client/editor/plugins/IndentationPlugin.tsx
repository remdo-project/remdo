import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';
import { INDENT_NOTES_COMMAND, OUTDENT_NOTES_COMMAND } from '#client/editor/commands';
import { indentNotesInRange, outdentNotesInRange } from '#client/editor/outline/note-ops';
import { $resolveZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { $resolveSelectedNoteRange } from './selected-note-range';

function $indent(editor: LexicalEditor, direction: 'indent' | 'outdent'): boolean {
  const range = $resolveSelectedNoteRange(editor);
  if (!range) {
    return false;
  }
  const zoomRoot = $resolveZoomRoot(editor);
  return direction === 'indent'
    ? indentNotesInRange(range, zoomRoot)
    : outdentNotesInRange(range, zoomRoot);
}

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event: KeyboardEvent) => {
          const range = $resolveSelectedNoteRange(editor);
          if (!range) {
            return false;
          }

          event.preventDefault();
          $indent(editor, event.shiftKey ? 'outdent' : 'indent');
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(INDENT_NOTES_COMMAND, () => $indent(editor, 'indent'), COMMAND_PRIORITY_LOW),
      editor.registerCommand(OUTDENT_NOTES_COMMAND, () => $indent(editor, 'outdent'), COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}
