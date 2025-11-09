import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $indentNote, $outdentNote } from '../lexical-helpers';

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

        // Get all nodes in the selection
        const selectedNodes = selection.getNodes();

        // Find all list items in the selection (including parent list items)
        const listItems: Set<any> = new Set();

        for (const node of selectedNodes) {
          let currentNode = node;

          // Traverse up to find the list item
          while (currentNode && !$isListItemNode(currentNode)) {
            const parent = currentNode.getParent();
            if (!parent) {
              break;
            }
            currentNode = parent;
          }

          if ($isListItemNode(currentNode)) {
            listItems.add(currentNode);
          }
        }

        if (listItems.size === 0) {
          return false;
        }

        event.preventDefault();

        // Apply indent/outdent to all selected list items
        for (const listItem of listItems) {
          if (event.shiftKey) {
            $outdentNote(listItem);
          } else {
            $indentNote(listItem);
          }
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
