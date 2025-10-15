import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $indentNote } from '../lexical-helpers';

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
        let anchorNode = selection.anchor.getNode();

        while (anchorNode && !$isListItemNode(anchorNode)) {
          const parent = anchorNode.getParent();
          if (!parent) {
            break;
          }
          anchorNode = parent;
        }

        if (!$isListItemNode(anchorNode)) {
          return false;
        }

        const listItem = anchorNode;

        event.preventDefault();

        // Dispatch indent/outdent command based on shift key
        if (event.shiftKey) {
          editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        } else {
          editor.update(() => {
            $indentNote(listItem.getKey());
          });
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
