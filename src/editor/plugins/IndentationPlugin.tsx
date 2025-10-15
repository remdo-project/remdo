import type { ListItemNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';
import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $indentNote } from '@/editor/note/lexical';

function findNearestListItemNode(node: LexicalNode | null): ListItemNode | null {
  let current: LexicalNode | null = node;
  while (current !== null) {
    if ($isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

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

        // Resolve nearest ListItemNode from the selection anchor
        const anchorNode = selection.anchor.getNode();
        const listItem = findNearestListItemNode(anchorNode);

        if (!$isListItemNode(listItem)) {
          return false;
        }

        event.preventDefault();

        // Dispatch indent/outdent command based on shift key
        if (event.shiftKey) {
          editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        } else {
          $indentNote(listItem);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
