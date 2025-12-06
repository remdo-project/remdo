import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
} from 'lexical';
import type { TextNode } from 'lexical';
import { useEffect } from 'react';
import {
  findNearestListItem,
  isChildrenWrapper,
  getContentListItem,
  insertBefore,
} from '@/editor/outline/list-structure';

function $createNote(text: string): ListItemNode {
  const item = $createListItemNode();
  item.append($createTextNode(text));
  return item;
}

function $handleEnterAtStart(contentItem: ListItemNode) {
  const newItem = $createNote('');
  contentItem.insertBefore(newItem);
  const textNode = newItem.getChildren().find($isTextNode);
  textNode?.select(0, 0);
}

function $handleEnterAtEnd(contentItem: ListItemNode) {
  const wrapper = contentItem.getNextSibling();
  const list = isChildrenWrapper(wrapper) ? wrapper.getFirstChild<ListNode>() : null;

  if (list && list.getChildrenSize() > 0) {
    const newChild = $createNote('');
    const firstChild = list.getFirstChild();
    if (firstChild) {
      insertBefore(firstChild, [newChild]);
    } else {
      list.append(newChild);
    }
    const textNode = newChild.getChildren().find($isTextNode);
    textNode?.select(0, 0);
    return;
  }

  const newSibling = $createNote('');
  contentItem.insertAfter(newSibling);
  const textNode = newSibling.getChildren().find($isTextNode);
  textNode?.select(0, 0);
}

export function InsertionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const candidateNote = findNearestListItem(selection.anchor.getNode());
        if (!candidateNote) {
          return false;
        }

        const contentItem = getContentListItem(candidateNote);
        const textNode = selection.anchor.getNode() as TextNode;
        const offset = selection.anchor.offset;

        if (offset === 0) {
          event?.preventDefault();
          event?.stopPropagation();
          $handleEnterAtStart(contentItem);
          return true;
        }

        if (offset === textNode.getTextContentSize()) {
          event?.preventDefault();
          event?.stopPropagation();
          $handleEnterAtEnd(contentItem);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}

export default InsertionPlugin;
