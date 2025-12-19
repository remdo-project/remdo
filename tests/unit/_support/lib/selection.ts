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

export function getListItemLabel(item: ListItemNode): string | null {
  const contentItem = resolveContentListItem(item);
  const pieces: string[] = [];
  for (const child of contentItem.getChildren()) {
    if (typeof child.getType === 'function' && child.getType() === 'list') {
      continue;
    }

    const getTextContent = (child as { getTextContent?: () => string }).getTextContent;
    if (typeof getTextContent === 'function') {
      pieces.push(getTextContent.call(child));
    }
  }

  const label = pieces.join('');
  if (label.length > 0) {
    return label;
  }

  return null;
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
