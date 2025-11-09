import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalNode } from 'lexical';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
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

        const selectionNodes = selection.getNodes();
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

        const orderedItems = sortByDocumentOrder(listItems);

        event.preventDefault();

        if (event.shiftKey) {
          for (const listItem of orderedItems) {
            $outdentNote(listItem);
          }
        } else {
          for (const listItem of orderedItems) {
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
