import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, INDENT_CONTENT_COMMAND, KEY_TAB_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
import { useEffect } from 'react';

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        // Only handle collapsed (not range) selections
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        // Check if we're in a list item
        const anchorNode = selection.anchor.getNode();
        const listItem = anchorNode.getParent();

        if (!$isListItemNode(listItem)) {
          return false;
        }

        event.preventDefault();

        // Dispatch indent/outdent command based on shift key
        if (event.shiftKey) {
          editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        } else {
          editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
