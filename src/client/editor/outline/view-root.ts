import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey } from 'lexical';
import { isChildrenWrapper } from './list-structure';

const viewRootStore = new WeakMap<LexicalEditor, string | null>();
const viewRootListeners = new WeakMap<LexicalEditor, Set<() => void>>();
const pendingViewRootNotifications = new WeakSet<LexicalEditor>();

export function setViewRoot(editor: LexicalEditor, key: string | null): void {
  if (getViewRoot(editor) === key) {
    return;
  }
  viewRootStore.set(editor, key);
  if (!pendingViewRootNotifications.has(editor)) {
    pendingViewRootNotifications.add(editor);
    queueMicrotask(() => {
      pendingViewRootNotifications.delete(editor);
      for (const listener of viewRootListeners.get(editor) ?? []) {
        listener();
      }
    });
  }
}

export function getViewRoot(editor: LexicalEditor): string | null {
  return viewRootStore.get(editor) ?? null;
}

export function subscribeViewRoot(editor: LexicalEditor, listener: () => void): () => void {
  const listeners = viewRootListeners.get(editor) ?? new Set<() => void>();
  listeners.add(listener);
  viewRootListeners.set(editor, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      viewRootListeners.delete(editor);
    }
  };
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
