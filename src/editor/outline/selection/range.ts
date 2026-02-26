import type { ListItemNode } from '@lexical/list';
import { $getNodeByKey } from 'lexical';
import type { OutlineSelectionRange } from './model';
import { resolveContentItemFromNode } from '../schema';
import { resolveContiguousSiblingRangeBetween } from './sibling-run';
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
  return resolveContiguousSiblingRangeBetween(start, end) ?? [];
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
