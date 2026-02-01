import type { ListItemNode, ListNode } from '@lexical/list';
import { $getRoot } from 'lexical';
import { useCallback, useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isListNode } from '@lexical/list';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { getParentContentItem, getSubtreeItems, getWrapperForContent } from '@/editor/outline/selection/tree';
import { clearZoomScrollTarget, getZoomScrollTarget, isZoomScrollTargetExpired } from '@/editor/zoom/scroll-target';
import { scrollZoomTargetIntoView } from '@/editor/zoom/scroll-utils';

const HIDDEN_CLASS = 'zoom-hidden';

interface ZoomVisibilityPluginProps {
  zoomNoteId?: string | null;
}

const resolveZoomNoteId = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const collectAllListItemKeys = (list: ListNode, keys: Set<string>) => {
  for (const child of list.getChildren()) {
    const item = child as ListItemNode;
    keys.add(item.getKey());
    if (isChildrenWrapper(item)) {
      const nested = item.getFirstChild<ListNode>();
      if (nested) {
        collectAllListItemKeys(nested, keys);
      }
    }
  }
};

const buildVisibleKeys = (root: ListItemNode) => {
  const visibleKeys = new Set<string>();
  const subtree = getSubtreeItems(root);
  for (const item of subtree) {
    visibleKeys.add(item.getKey());
    const wrapper = getWrapperForContent(item);
    if (wrapper) {
      visibleKeys.add(wrapper.getKey());
    }
  }

  let ancestor = getParentContentItem(root);
  while (ancestor) {
    const wrapper = getWrapperForContent(ancestor);
    if (wrapper) {
      visibleKeys.add(wrapper.getKey());
    }
    ancestor = getParentContentItem(ancestor);
  }

  return visibleKeys;
};

export function ZoomVisibilityPlugin({ zoomNoteId }: ZoomVisibilityPluginProps) {
  const [editor] = useLexicalComposerContext();
  const zoomNoteIdRef = useRef<string | null>(resolveZoomNoteId(zoomNoteId));
  const flattenedWrapperKeysRef = useRef<Set<string>>(new Set());

  const applyVisibility = useCallback((editorState = editor.getEditorState()) => {
    const result = editorState.read(() => {
      const list = $getRoot().getFirstChild<ListNode>()!;
      const allKeys = new Set<string>();
      collectAllListItemKeys(list, allKeys);

      const flattenedWrapperKeys = new Set<string>();
      const noteId = zoomNoteIdRef.current;
      if (!noteId) {
        return { visibleKeys: null as Set<string> | null, allKeys, flattenedWrapperKeys };
      }

      const root = $findNoteById(noteId);
      if (!root) {
        return { visibleKeys: null as Set<string> | null, allKeys, flattenedWrapperKeys };
      }

      let current: ListItemNode | null = root;
      while (current) {
        const parentList = current.getParent();
        if (!$isListNode(parentList)) {
          break;
        }

        const parentWrapper = parentList.getParent();
        if (!isChildrenWrapper(parentWrapper)) {
          break;
        }

        flattenedWrapperKeys.add(parentWrapper.getKey());
        current = getParentContentItem(current);
      }

      return {
        visibleKeys: buildVisibleKeys(root),
        allKeys,
        flattenedWrapperKeys,
      };
    });

    for (const key of result.allKeys) {
      const element = editor.getElementByKey(key);
      if (!element) {
        continue;
      }
      if (result.visibleKeys) {
        element.classList.toggle(HIDDEN_CLASS, !result.visibleKeys.has(key));
      } else {
        element.classList.remove(HIDDEN_CLASS);
      }
    }

    const previousWrappers = flattenedWrapperKeysRef.current;
    const nextWrappers = result.flattenedWrapperKeys;

    for (const key of previousWrappers) {
      if (!nextWrappers.has(key)) {
        const wrapper = editor.getElementByKey(key);
        if (wrapper instanceof HTMLElement) {
          delete wrapper.dataset.zoomFlatten;
        }
      }
    }

    for (const key of nextWrappers) {
      const wrapper = editor.getElementByKey(key);
      if (wrapper instanceof HTMLElement) {
        wrapper.dataset.zoomFlatten = 'true';
      }
    }

    flattenedWrapperKeysRef.current = nextWrappers;

    const pendingScroll = getZoomScrollTarget(editor);
    if (!pendingScroll) {
      return;
    }

    if (isZoomScrollTargetExpired(pendingScroll)) {
      clearZoomScrollTarget(editor);
      return;
    }

    const targetElement = editor.getElementByKey(pendingScroll.key);
    if (!(targetElement instanceof HTMLElement) || targetElement.classList.contains(HIDDEN_CLASS)) {
      return;
    }

    if (scrollZoomTargetIntoView(editor, targetElement)) {
      clearZoomScrollTarget(editor);
    }
  }, [editor]);

  useEffect(() => {
    zoomNoteIdRef.current = resolveZoomNoteId(zoomNoteId);
    applyVisibility();
  }, [applyVisibility, zoomNoteId]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      applyVisibility(editorState);
    });
  }, [applyVisibility, editor]);

  return null;
}
