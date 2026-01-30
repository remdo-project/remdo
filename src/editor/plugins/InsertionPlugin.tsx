import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { useEffect } from 'react';
import {
  findNearestListItem,
  isChildrenWrapper,
  getContentListItem,
  insertBefore,
} from '@/editor/outline/list-structure';
import { isPointAtBoundary, resolveBoundaryPoint } from '@/editor/outline/selection/caret';

type CaretPlacement = 'start' | 'middle' | 'end';

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

function resolveCaretPlacement(selection: ReturnType<typeof $getSelection>, contentItem: ListItemNode): CaretPlacement | null {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  if (contentItem.getTextContent().length === 0) {
    return 'start';
  }

  if (isPointAtBoundary(selection.anchor, contentItem, 'start')) {
    return 'start';
  }

  if (isPointAtBoundary(selection.anchor, contentItem, 'end')) {
    return 'end';
  }

  return 'middle';
}

function $splitContentItemAtSelection(contentItem: ListItemNode, selection: ReturnType<typeof $getSelection>): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode) || anchorNode.getParent() !== contentItem) {
    return false;
  }

  const offset = selection.anchor.offset;
  const size = anchorNode.getTextContentSize();
  let splitAfterNode = null;

  if (offset > 0 && offset < size) {
    const [, rightNode] = anchorNode.splitText(offset);
    splitAfterNode = rightNode;
  } else if (offset === 0) {
    splitAfterNode = anchorNode;
  } else if (offset === size) {
    splitAfterNode = anchorNode.getNextSibling();
  }

  if (!splitAfterNode) {
    return false;
  }

  const newItem = $createListItemNode();
  let child = contentItem.getFirstChild();
  while (child && child !== splitAfterNode) {
    const next = child.getNextSibling();
    newItem.append(child);
    child = next;
  }

  if (newItem.getChildrenSize() === 0) {
    return false;
  }

  contentItem.insertBefore(newItem);

  const caretPoint = resolveBoundaryPoint(contentItem, 'start');
  if (caretPoint) {
    const range = $createRangeSelection();
    range.setTextNodeRange(caretPoint.node, caretPoint.offset, caretPoint.node, caretPoint.offset);
    $setSelection(range);
  }

  return true;
}

export function InsertionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!editor.selection.isStructural()) {
            return false;
          }

          event?.preventDefault();
          event?.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || !editor.selection.isStructural()) {
            return false;
          }
          if (event.altKey || event.metaKey || event.ctrlKey) {
            return false;
          }
          if (event.key.length !== 1) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
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
          const placement = resolveCaretPlacement(selection, contentItem);
          if (placement === 'start') {
            event?.preventDefault();
            event?.stopPropagation();
            $handleEnterAtStart(contentItem);
            return true;
          }

          if (placement === 'end') {
            event?.preventDefault();
            event?.stopPropagation();
            $handleEnterAtEnd(contentItem);
            return true;
          }

          if (placement === 'middle') {
            const split = $splitContentItemAtSelection(contentItem, selection);
            if (!split) {
              return false;
            }
            event?.preventDefault();
            event?.stopPropagation();
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor]);

  return null;
}

export default InsertionPlugin;
