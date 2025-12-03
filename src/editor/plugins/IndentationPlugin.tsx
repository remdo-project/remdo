import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalNode } from 'lexical';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $indentNote, $outdentNote } from '../lexical-helpers';
import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';
import { getContiguousSelectionHeads } from '@/editor/outline/structural-selection';

const hasPreviousContentSibling = (noteItem: ListItemNode): boolean => {
  let sibling: ListItemNode | null = noteItem.getPreviousSibling();

  while (sibling) {
    const children = sibling.getChildren();
    const isWrapper = children.length === 1 && children[0]?.getType() === 'list';
    if (!isWrapper) {
      return true;
    }
    sibling = sibling.getPreviousSibling();
  }

  return false;
};

const canIndentNote = (noteItem: ListItemNode): boolean => hasPreviousContentSibling(noteItem);

const isChildrenWrapper = (node: LexicalNode | null): node is ListItemNode => {
  return (
    $isListItemNode(node) &&
    node.getChildren().length === 1 &&
    $isListNode(node.getFirstChild())
  );
};

const canOutdentNote = (noteItem: ListItemNode): boolean => {
  const parentList = noteItem.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const parentWrapper = parentList.getParent();
  if (!isChildrenWrapper(parentWrapper)) {
    return false;
  }

  const grandParentList = parentWrapper.getParent();
  return $isListNode(grandParentList);
};

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

        const heads = getContiguousSelectionHeads(selection);
        let rootItems = heads;

        if (rootItems.length === 0 && selection.isCollapsed()) {
          const caretItem = findNearestListItem(selection.anchor.getNode());
          if (caretItem) {
            rootItems = [getContentListItem(caretItem)];
          }
        }

        if (rootItems.length === 0) {
          return false;
        }

        event.preventDefault();

        if (event.shiftKey) {
          const allCanOutdent = rootItems.every(canOutdentNote);
          if (!allCanOutdent) {
            return true;
          }

          for (const listItem of rootItems.toReversed()) {
            $outdentNote(listItem);
          }
        } else {
          // Check if all notes can be indented before attempting to indent any
          const allCanIndent = rootItems.every(canIndentNote);
          if (!allCanIndent) {
            // If any note can't be indented, make the entire operation a no-op
            return true;
          }

          for (const listItem of rootItems) {
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
