import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey } from 'lexical';
import { isChildrenWrapper } from './list-structure';

const viewRootStore = new WeakMap<LexicalEditor, string | null>();

export function setViewRoot(editor: LexicalEditor, key: string | null): void {
  viewRootStore.set(editor, key);
}

export function getViewRoot(editor: LexicalEditor): string | null {
  return viewRootStore.get(editor) ?? null;
}

export function $resolveViewRoot(editor: LexicalEditor): ListItemNode | null {
  const rootKey = getViewRoot(editor);
  if (!rootKey) {
    return null;
  }
  const rootNode = $getNodeByKey(rootKey);
  if (!$isListItemNode(rootNode) || isChildrenWrapper(rootNode)) {
    return null;
  }
  return rootNode;
}
