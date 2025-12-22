import type { ListItemNode } from '@lexical/list';
import type { RangeSelection, LexicalNode } from 'lexical';
import { reportInvariant } from '@/editor/invariant';
import { getContentListItem, findNearestListItem } from './list-structure';

export const getSelectedNotes = (selection: RangeSelection): ListItemNode[] => {
  const ordered: ListItemNode[] = [];
  const seen = new Set<string>();

  const candidates: LexicalNode[] = selection.getNodes();

  for (const node of candidates) {
    const listItem = findNearestListItem(node);
    if (!listItem) {
      reportInvariant({
        message: 'Selected node is not within a list item',
        context: { nodeType: node.getType() },
      });
      continue;
    }

    const contentItem = getContentListItem(listItem);
    const key = contentItem.getKey();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(contentItem);
  }

  return ordered;
};
