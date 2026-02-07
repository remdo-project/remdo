import type { ListItemNode } from '@lexical/list';
import { $getNearestNodeFromDOMNode } from 'lexical';

import { $isNoteFolded } from '#lib/editor/fold-state';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from '@/editor/outline/list-structure';
import { noteHasChildren } from '@/editor/outline/selection/tree';

export interface ResolvedNoteState {
  contentItem: ListItemNode;
  noteKey: string;
  hasChildren: boolean;
  isFolded: boolean;
}

export function $resolveNoteStateFromDOMNode(node: Node | null): ResolvedNoteState | null {
  const lexicalNode = node ? $getNearestNodeFromDOMNode(node) : null;
  if (!lexicalNode) {
    return null;
  }
  const listItem = findNearestListItem(lexicalNode);
  if (!listItem) {
    return null;
  }
  const contentItem = getContentListItem(listItem);
  if (isChildrenWrapper(contentItem)) {
    return null;
  }
  const hasChildren = noteHasChildren(contentItem);
  return {
    contentItem,
    noteKey: contentItem.getKey(),
    hasChildren,
    isFolded: hasChildren && $isNoteFolded(contentItem),
  };
}
