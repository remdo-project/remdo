import type { ListItemNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

function $findNearestListItemNode(node: LexicalNode): ListItemNode | null {
  let current: LexicalNode | null = node;
  while (current != null) {
    if ($isListItemNode(current)) {
      return current;
    }

    current = current.getParent();
  }

  return null;
}

function canIndentListItem(listItem: ListItemNode): boolean {
  if (listItem.getPreviousSibling() === null) {
    return false;
  }

  const parentList = listItem.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const listParent = parentList.getParent();
  return $isListItemNode(listParent);
}

function canOutdentListItem(listItem: ListItemNode): boolean {
  return listItem.getIndent() > 0;
}

export default function IndentationPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (event == null) {
          return false;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const listItem = $findNearestListItemNode(selection.anchor.getNode());
        if (listItem == null) {
          return false;
        }

        event.preventDefault();

        if (!selection.isCollapsed()) {
          return true;
        }

        if (event.shiftKey) {
          if (canOutdentListItem(listItem)) {
            editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
          }
          return true;
        }

        if (canIndentListItem(listItem)) {
          editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
