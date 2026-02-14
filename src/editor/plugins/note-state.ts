import type { ListItemNode } from '@lexical/list';

import { $isNoteFolded } from '#lib/editor/fold-state';
import { $resolveContentNoteFromDOMNode } from '@/editor/outline/note-context';
import { noteHasChildren } from '@/editor/outline/selection/tree';

interface ResolvedNoteState {
  contentItem: ListItemNode;
  noteKey: string;
  hasChildren: boolean;
  isFolded: boolean;
}

export function $resolveNoteStateFromDOMNode(node: Node | null): ResolvedNoteState | null {
  const contentItem = $resolveContentNoteFromDOMNode(node);
  if (!contentItem) {
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
