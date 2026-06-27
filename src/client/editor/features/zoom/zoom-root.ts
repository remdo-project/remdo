import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey } from 'lexical';
import { isChildrenWrapper } from '#client/editor/outline/list-structure';

const zoomRootStore = new WeakMap<LexicalEditor, string | null>();

export function setZoomRoot(editor: LexicalEditor, key: string | null): void {
  zoomRootStore.set(editor, key);
}

export function getZoomRoot(editor: LexicalEditor): string | null {
  return zoomRootStore.get(editor) ?? null;
}

export function $resolveZoomRoot(editor: LexicalEditor): ListItemNode | null {
  const rootKey = getZoomRoot(editor);
  if (!rootKey) {
    return null;
  }
  const rootNode = $getNodeByKey<ListItemNode>(rootKey);
  if (!$isListItemNode(rootNode) || isChildrenWrapper(rootNode)) {
    return null;
  }
  return rootNode;
}
