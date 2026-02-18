import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey } from 'lexical';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { isContentDescendantOf } from './tree';

const zoomBoundaryStore = new WeakMap<LexicalEditor, string | null>();

export function setZoomBoundary(editor: LexicalEditor, key: string | null): void {
  zoomBoundaryStore.set(editor, key);
}

export function getZoomBoundary(editor: LexicalEditor): string | null {
  return zoomBoundaryStore.get(editor) ?? null;
}

export function $resolveZoomBoundaryRoot(editor: LexicalEditor): ListItemNode | null {
  const boundaryKey = getZoomBoundary(editor);
  if (!boundaryKey) {
    return null;
  }
  const boundaryNode = $getNodeByKey<ListItemNode>(boundaryKey);
  if (!$isListItemNode(boundaryNode) || isChildrenWrapper(boundaryNode)) {
    return null;
  }
  return boundaryNode;
}

export function isWithinZoomBoundary(item: ListItemNode, boundaryRoot: ListItemNode | null): boolean {
  return boundaryRoot === null || isContentDescendantOf(item, boundaryRoot);
}
