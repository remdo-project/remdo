import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey } from 'lexical';
import { isChildrenWrapper } from '#client/editor/outline/list-structure';
import { isContentDescendantOf } from './selection/tree';

const editingScopeStore = new WeakMap<LexicalEditor, string | null>();

export function setEditingScope(editor: LexicalEditor, key: string | null): void {
  editingScopeStore.set(editor, key);
}

export function getEditingScope(editor: LexicalEditor): string | null {
  return editingScopeStore.get(editor) ?? null;
}

export function $resolveEditingScopeRoot(editor: LexicalEditor): ListItemNode | null {
  const scopeKey = getEditingScope(editor);
  if (!scopeKey) {
    return null;
  }
  const scopeNode = $getNodeByKey<ListItemNode>(scopeKey);
  if (!$isListItemNode(scopeNode) || isChildrenWrapper(scopeNode)) {
    return null;
  }
  return scopeNode;
}

export function isWithinEditingScope(item: ListItemNode, scopeRoot: ListItemNode | null): boolean {
  return scopeRoot === null || isContentDescendantOf(item, scopeRoot);
}
