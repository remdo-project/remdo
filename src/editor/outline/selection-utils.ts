import type { ListItemNode } from '@lexical/list';
import type { RangeSelection, LexicalNode } from 'lexical';
import { reportInvariant } from '@/editor/invariant';
import { getContentListItem, findNearestListItem } from './list-structure';

// TODO: review usage; feels artificial but leave behavior unchanged for now.
export const selectionIsContiguous = (notes: ListItemNode[], siblings: ListItemNode[]): boolean => {
  if (notes.length === 0) return false;
  const indexes = notes.map((note) => siblings.indexOf(note));
  if (indexes.includes(-1)) {
    reportInvariant({
      message: 'Notes are not all present in sibling list for contiguity check',
      context: { noteCount: notes.length, siblingCount: siblings.length },
    });
    return false;
  }
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  return last - first + 1 === notes.length;
};

export const getSelectedNotes = (selection: RangeSelection): ListItemNode[] => {
  const ordered: ListItemNode[] = [];
  const seen = new Set<string>();

  const candidates: LexicalNode[] = selection.getNodes();

  for (const node of candidates) {
    const listItem = findNearestListItem(node);
    if (!listItem) continue;

    const contentItem = getContentListItem(listItem);
    const key = contentItem.getKey();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(contentItem);
  }

  return ordered;
};
