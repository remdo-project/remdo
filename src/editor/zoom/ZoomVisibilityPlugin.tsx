import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { useCallback, useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { forEachListItemInOutline } from '@/editor/outline/list-traversal';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { $resolveRootContentList } from '@/editor/outline/schema';
import { getParentContentItem, getSubtreeItems, getWrapperForContent } from '@/editor/outline/selection/tree';
import { resolveZoomNoteId } from './zoom-note-id';
import { useZoomNoteId } from '@/editor/view/EditorViewProvider';

const HIDDEN_CLASS = 'zoom-hidden';
const ZOOM_ROOT_ATTR = 'zoomRoot';

const collectAllListItemKeys = (list: ListNode, keys: Set<string>) => {
  forEachListItemInOutline(list, (item) => {
    keys.add(item.getKey());
  });
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

const applyHiddenVisibility = (
  editor: LexicalEditor,
  allKeys: Set<string>,
  visibleKeys: Set<string> | null
) => {
  for (const key of allKeys) {
    const element = editor.getElementByKey(key);
    if (!element) {
      continue;
    }
    if (visibleKeys) {
      element.classList.toggle(HIDDEN_CLASS, !visibleKeys.has(key));
    } else {
      element.classList.remove(HIDDEN_CLASS);
    }
  }
};

const applyFlattenedWrappers = (
  editor: LexicalEditor,
  previousWrappers: Set<string>,
  nextWrappers: Set<string>
) => {
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
};

const applyZoomRootMarker = (
  editor: LexicalEditor,
  previousZoomRootKey: string | null,
  nextZoomRootKey: string | null
) => {
  if (previousZoomRootKey && previousZoomRootKey !== nextZoomRootKey) {
    const previousZoomRoot = editor.getElementByKey(previousZoomRootKey);
    if (previousZoomRoot instanceof HTMLElement) {
      delete previousZoomRoot.dataset[ZOOM_ROOT_ATTR];
    }
  }
  if (!nextZoomRootKey) {
    return;
  }
  const nextZoomRoot = editor.getElementByKey(nextZoomRootKey);
  if (nextZoomRoot instanceof HTMLElement) {
    nextZoomRoot.dataset[ZOOM_ROOT_ATTR] = 'true';
  }
};

export function ZoomVisibilityPlugin() {
  const [editor] = useLexicalComposerContext();
  const zoomNoteId = useZoomNoteId();
  const zoomNoteIdRef = useRef(resolveZoomNoteId(zoomNoteId));
  const flattenedWrapperKeysRef = useRef(new Set<string>());
  const zoomRootKeyRef = useRef<string | null>(null);

  const applyVisibility = useCallback((editorState = editor.getEditorState()) => {
    const result = editorState.read(() => {
      const allKeys = new Set<string>();
      const rootList = $resolveRootContentList();
      if (!rootList) {
        return {
          visibleKeys: null as Set<string> | null,
          allKeys,
          flattenedWrapperKeys: new Set<string>(),
          zoomRootKey: null as string | null,
        };
      }
      collectAllListItemKeys(rootList, allKeys);

      const flattenedWrapperKeys = new Set<string>();
      const noteId = zoomNoteIdRef.current;
      if (!noteId) {
        return { visibleKeys: null as Set<string> | null, allKeys, flattenedWrapperKeys, zoomRootKey: null };
      }

      const target = $findNoteById(noteId);
      if (!target) {
        return { visibleKeys: null as Set<string> | null, allKeys, flattenedWrapperKeys, zoomRootKey: null };
      }

      let current: ListItemNode | null = target;
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
        visibleKeys: buildVisibleKeys(target),
        allKeys,
        flattenedWrapperKeys,
        zoomRootKey: target.getKey(),
      };
    });

    const previousWrappers = flattenedWrapperKeysRef.current;
    const nextWrappers = result.flattenedWrapperKeys;
    applyHiddenVisibility(editor, result.allKeys, result.visibleKeys);
    applyFlattenedWrappers(editor, previousWrappers, nextWrappers);
    flattenedWrapperKeysRef.current = nextWrappers;
    applyZoomRootMarker(editor, zoomRootKeyRef.current, result.zoomRootKey);
    zoomRootKeyRef.current = result.zoomRootKey;
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
