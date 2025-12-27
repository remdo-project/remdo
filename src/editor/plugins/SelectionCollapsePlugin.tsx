import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_DOWN_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '@/editor/commands';

function shouldHandlePlainArrow(editor: LexicalEditor, event: KeyboardEvent | null): boolean {
  if (!editor.selection.isStructural()) {
    return false;
  }

  if (!event) {
    return true;
  }

  return !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
}

function dispatchCollapse(editor: LexicalEditor, edge: 'start' | 'end', event: KeyboardEvent | null): boolean {
  const handled = editor.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge });
  if (!handled) {
    return false;
  }

  event?.preventDefault();
  event?.stopPropagation();
  return true;
}

export function SelectionCollapsePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    installOutlineSelectionHelpers(editor);

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!shouldHandlePlainArrow(editor, event)) {
            return false;
          }

          return dispatchCollapse(editor, 'end', event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!shouldHandlePlainArrow(editor, event)) {
            return false;
          }

          return dispatchCollapse(editor, 'start', event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!shouldHandlePlainArrow(editor, event)) {
            return false;
          }

          return dispatchCollapse(editor, 'start', event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!shouldHandlePlainArrow(editor, event)) {
            return false;
          }

          return dispatchCollapse(editor, 'end', event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || !shouldHandlePlainArrow(editor, event)) {
            return false;
          }

          if (event.key !== 'Home' && event.key !== 'End' && event.key !== 'PageUp' && event.key !== 'PageDown') {
            return false;
          }

          const edge = event.key === 'Home' || event.key === 'PageUp' ? 'start' : 'end';
          return dispatchCollapse(editor, edge, event);
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor]);

  return null;
}

export default SelectionCollapsePlugin;
