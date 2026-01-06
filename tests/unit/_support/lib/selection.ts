import { $isListItemNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';
import { isChildrenWrapper } from '@/editor/outline/list-structure';

export { isChildrenWrapper };

export function collectSelectedListItems(selection: RangeSelection): ListItemNode[] {
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
  if (!isChildrenWrapper(item)) {
    return item;
  }

  const previous = item.getPreviousSibling();
  return $isListItemNode(previous) ? previous : item;
}

export function findNearestListItem(node: LexicalNode | null): ListItemNode | null {
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
  const rootElement = editor.getRootElement();
  if (!rootElement) {
    throw new TypeError('Expected editor root element');
  }
  return rootElement;
}
