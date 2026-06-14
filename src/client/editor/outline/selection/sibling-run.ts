import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { getContentSiblings } from '../list-structure';

interface ContiguousRunIndexes {
  startIndex: number;
  endIndex: number;
}

export function resolveContiguousRunIndexes(
  notes: readonly ListItemNode[],
  siblings: readonly ListItemNode[]
): ContiguousRunIndexes | null {
  if (notes.length === 0) {
    return null;
  }

  const indexes = notes.map((note) => siblings.indexOf(note));
  if (indexes.includes(-1)) {
    return null;
  }

  const startIndex = Math.min(...indexes);
  const endIndex = Math.max(...indexes);
  if (endIndex - startIndex + 1 !== notes.length) {
    return null;
  }

  return { startIndex, endIndex };
}

export function resolveContiguousSiblingRangeFromHeads(heads: readonly ListItemNode[]): ListItemNode[] | null {
  const first = heads[0];
  if (!first) {
    return null;
  }

  const parent = first.getParent();
  if (!$isListNode(parent)) {
    return null;
  }
  if (!heads.every((head) => head.getParent() === parent)) {
    return null;
  }

  const siblings = getContentSiblings(parent);
  const run = resolveContiguousRunIndexes(heads, siblings);
  if (!run) {
    return null;
  }

  return siblings.slice(run.startIndex, run.endIndex + 1);
}

export function resolveContiguousSiblingRangeBetween(start: ListItemNode, end: ListItemNode): ListItemNode[] | null {
  const parent = start.getParent();
  if (!$isListNode(parent) || end.getParent() !== parent) {
    return null;
  }

  const siblings = getContentSiblings(parent);
  const startIndex = siblings.indexOf(start);
  const endIndex = siblings.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return null;
  }

  return siblings.slice(startIndex, endIndex + 1);
}
