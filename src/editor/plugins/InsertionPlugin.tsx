import type { ListItemNode } from '@lexical/list';
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
  $getOrCreateChildList,
  findNearestListItem,
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

function $handleEnterInMiddle(contentItem: ListItemNode, textNode: TextNode, offset: number) {
  const text = textNode.getTextContent();
  const before = text.slice(0, offset);
  const after = text.slice(offset);

  const newItem = $createNote(before);
  contentItem.insertBefore(newItem);

  textNode.setTextContent(after);
  textNode.select(0, 0);
}

function $handleEnterAtEnd(contentItem: ListItemNode) {
  const list = $getOrCreateChildList(contentItem);
  const newChild = $createNote('');

  const firstChild = list.getFirstChild();
  if (firstChild) {
    insertBefore(firstChild, [newChild]);
  } else {
    list.append(newChild);
  }

  const textNode = newChild.getChildren().find($isTextNode);
  textNode?.select(0, 0);
}

export function InsertionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        let handled = false;

        editor.update(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return;
          }

          const candidateNote = findNearestListItem(selection.anchor.getNode());
          if (!candidateNote) {
            return;
          }

          const contentItem = getContentListItem(candidateNote);
          const textNode = selection.anchor.getNode() as TextNode;
          const offset = selection.anchor.offset;

          event?.preventDefault();
          event?.stopPropagation();

          if (offset === 0) {
            $handleEnterAtStart(contentItem);
          } else if (offset === textNode.getTextContentSize()) {
            $handleEnterAtEnd(contentItem);
          } else {
            $handleEnterInMiddle(contentItem, textNode, offset);
          }

          handled = true;
        });

        return handled;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}

export default InsertionPlugin;
