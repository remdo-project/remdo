import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalNode } from 'lexical';
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_TAB_COMMAND,
} from 'lexical';
import { useEffect } from 'react';
import { $indentNote, $outdentNote } from '../lexical-helpers';

const findNearestListItem = (node: LexicalNode | null) => {
  let current: LexicalNode | null = node;

  while (current && !$isListItemNode(current)) {
    current = current.getParent();
  }

  return $isListItemNode(current) ? current : null;
};

const getNodePath = (node: ListItemNode): number[] => {
  const path: number[] = [];
  let current: LexicalNode | null = node;

  while (current) {
    const parent: LexicalNode | null = current.getParent();
    if (!parent) {
      break;
    }
    path.push(current.getIndexWithinParent());
    current = parent;
  }

  return path.reverse();
};

const sortByDocumentOrder = (items: ListItemNode[]): ListItemNode[] =>
  items
    .map((node) => ({ node, path: getNodePath(node) }))
    .sort((a, b) => {
      const depth = Math.max(a.path.length, b.path.length);
      for (let i = 0; i < depth; i++) {
        const left = a.path[i] ?? -1;
        const right = b.path[i] ?? -1;
        if (left !== right) {
          return left - right;
        }
      }
      return 0;
    })
    .map(({ node }) => node);

const hasPreviousContentSibling = (noteItem: ListItemNode): boolean => {
  let sibling: LexicalNode | null = noteItem.getPreviousSibling();

  while (sibling) {
    if ($isListItemNode(sibling)) {
      const children = sibling.getChildren();
      const isWrapper = children.length === 1 && children[0]?.getType() === 'list';
      if (!isWrapper) {
        return true;
      }
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
        let selectionNodes: LexicalNode[];

        if ($isRangeSelection(selection) || $isNodeSelection(selection)) {
          selectionNodes = selection.getNodes();
        } else {
          return false;
        }
        const listItems: ListItemNode[] = [];
        const seen = new Set<string>();

        for (const node of selectionNodes) {
          const listItem = findNearestListItem(node);
          if (!listItem) {
            continue;
          }

          const key = listItem.getKey();
          if (seen.has(key)) {
            continue;
          }

          listItems.push(listItem);
          seen.add(key);
        }

        if (listItems.length === 0) {
          return false;
        }

        const orderedItems: ListItemNode[] = sortByDocumentOrder(listItems);
        const targetParent = orderedItems[0]?.getParent() ?? null;
        const contentItems: ListItemNode[] = [];
        for (const item of orderedItems) {
          const parent = item.getParent();
          if (!isChildrenWrapper(item) && parent === targetParent) {
            contentItems.push(item);
          }
        }
        const rootItems = contentItems.filter(
          (item, index) => !contentItems.some((other, otherIndex) => otherIndex !== index && other.isParentOf(item))
        );
        if (rootItems.length === 0) {
          return true;
        }

        event.preventDefault();

        if (event.shiftKey) {
          const allCanOutdent = rootItems.every(canOutdentNote);
          if (!allCanOutdent) {
            return true;
          }

          for (const listItem of [...rootItems].reverse()) {
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
