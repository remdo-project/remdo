import { $isListItemNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';
import { isChildrenWrapper } from '@/editor/outline/list-structure';

export { isChildrenWrapper };

export function collectSelectedListItems(selection: RangeSelection): ListItemNode[] {
  // Collects unique list items touched by a RangeSelection for structural logic.
  // Limitations: only inspects nodes in the current selection; callers must pass a RangeSelection.
  const seen = new Set<string>();
  const items: ListItemNode[] = [];

  for (const node of selection.getNodes()) {
    const listItem = findNearestListItem(node);
    if (!listItem || !listItem.isAttached()) {
      continue;
    }

    const key = listItem.getKey();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(listItem);
  }

  return items.toSorted((a, b) => (a === b ? 0 : a.isBefore(b) ? -1 : 1));
}

export function resolveContentListItem(item: ListItemNode): ListItemNode {
  // Resolves a list item to the content-bearing item when selection lands on a children wrapper.
  // Limitations: returns the wrapper itself if no previous sibling exists.
  if (!isChildrenWrapper(item)) {
    return item;
  }

  const previous = item.getPreviousSibling();
  return $isListItemNode(previous) ? previous : item;
}

export function findNearestListItem(node: LexicalNode | null): ListItemNode | null {
  // Walks up the tree to find the nearest list item for a node.
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListItemNode(current)) {
      return resolveContentListItem(current);
    }
    current = current.getParent();
  }
  return null;
}

export function getRootElementOrThrow(editor: { getRootElement: () => HTMLElement | null }): HTMLElement {
  // Returns the editor root element for focus-sensitive helpers.
  const rootElement = editor.getRootElement();
  if (!rootElement) {
    throw new TypeError('Expected editor root element');
  }
  return rootElement;
}
