import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { $getNodeByKey } from 'lexical';
import type { OutlineSelectionRange } from './model';
import { getContentSiblings } from '../list-structure';
import { resolveContentItemFromNode } from '../schema';
import { getSubtreeItems } from './tree';

function $resolveRangeBoundaryItem(key: string): ListItemNode | null {
  const node = $getNodeByKey<ListItemNode>(key);
  const content = resolveContentItemFromNode(node);
  if (!content || !content.isAttached()) {
    return null;
  }
  return content;
}

export function $resolveStructuralHeadsFromRange(range: OutlineSelectionRange): ListItemNode[] {
  const start = $resolveRangeBoundaryItem(range.headStartKey);
  const end = $resolveRangeBoundaryItem(range.headEndKey);
  if (!start || !end) {
    return [];
  }

  const parent = start.getParent();
  if (!$isListNode(parent) || end.getParent() !== parent) {
    return [];
  }

  const siblings = getContentSiblings(parent);
  const startIndex = siblings.indexOf(start);
  const endIndex = siblings.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return [];
  }

  return siblings.slice(startIndex, endIndex + 1);
}

export function $resolveStructuralItemsFromRange(range: OutlineSelectionRange): ListItemNode[] {
  const heads = $resolveStructuralHeadsFromRange(range);
  if (heads.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const items: ListItemNode[] = [];
  for (const head of heads) {
    for (const item of getSubtreeItems(head)) {
      const key = item.getKey();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}
