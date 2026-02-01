import { $getNearestNodeFromDOMNode, $getNodeByKey, $getSelection, $isRangeSelection, COLLABORATION_TAG } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { isBulletHit } from '@/editor/outline/bullet-hit-test';
import { setSelectionBoundary } from '@/editor/outline/selection/boundary';
import { setZoomScrollTarget } from '@/editor/zoom/scroll-target';
import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from '@/editor/plugins/collaboration/CollaborationProvider';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { $findNoteById, $getNoteAncestorPath } from '@/editor/outline/note-traversal';
import { getParentContentItem } from '@/editor/outline/selection/tree';
import { $getNoteId } from '#lib/editor/note-id-state';

interface ZoomPluginProps {
  zoomNoteId?: string | null;
  onZoomNoteIdChange?: (noteId: string | null) => void;
  onZoomPathChange?: (path: NotePathItem[]) => void;
}

const isPathEqual = (next: NotePathItem[], prev: NotePathItem[] | null) => {
  if (!prev || next.length !== prev.length) {
    return false;
  }
  return next.every((item, index) => {
    const prevItem = prev[index];
    if (!prevItem) {
      return false;
    }
    return item.noteId === prevItem.noteId && item.label === prevItem.label;
  });
};

const resolveZoomNoteId = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isDescendantOf = (candidate: ListItemNode, ancestor: ListItemNode): boolean => {
  let current: ListItemNode | null = candidate;
  while (current) {
    if (current.getKey() === ancestor.getKey()) {
      return true;
    }
    current = getParentContentItem(current);
  }
  return false;
};

const findLowestCommonAncestor = (left: ListItemNode, right: ListItemNode): ListItemNode | null => {
  const leftKeys = new Set<string>();
  let current: ListItemNode | null = left;
  while (current) {
    leftKeys.add(current.getKey());
    current = getParentContentItem(current);
  }

  current = right;
  while (current) {
    if (leftKeys.has(current.getKey())) {
      return current;
    }
    current = getParentContentItem(current);
  }

  return null;
};

const resolveContentItem = (node: LexicalNode | null): ListItemNode | null => {
  if (!node) {
    return null;
  }
  if ($isListItemNode(node)) {
    const content = getContentListItem(node);
    return isChildrenWrapper(content) ? null : content;
  }
  if ($isListNode(node)) {
    const parent = node.getParent();
    if ($isListItemNode(parent)) {
      const content = getContentListItem(parent);
      return isChildrenWrapper(content) ? null : content;
    }
    return null;
  }
  const listItem = findNearestListItem(node);
  if (!listItem) {
    return null;
  }
  const content = getContentListItem(listItem);
  return isChildrenWrapper(content) ? null : content;
};

const $collectDirtyContentItems = (
  dirtyElements: Map<string, boolean>,
  dirtyLeaves: Set<string>
): ListItemNode[] => {
  const items = new Map<string, ListItemNode>();

  const addItem = (item: ListItemNode | null) => {
    if (!item) {
      return;
    }
    items.set(item.getKey(), item);
  };

  for (const [key, intentional] of dirtyElements) {
    if (!intentional) {
      continue;
    }
    const node = $getNodeByKey(key);
    addItem(resolveContentItem(node));
  }

  for (const key of dirtyLeaves) {
    const node = $getNodeByKey(key);
    addItem(resolveContentItem(node));
  }

  return Array.from(items.values());
};

const resolveZoomAncestor = (root: ListItemNode, outsideItems: ListItemNode[]): ListItemNode | null => {
  let candidate: ListItemNode | null = null;
  for (const item of outsideItems) {
    const next: ListItemNode | null = candidate
      ? findLowestCommonAncestor(candidate, item)
      : findLowestCommonAncestor(root, item);
    if (!next) {
      return null;
    }
    candidate = next;
  }
  return candidate;
};

export function ZoomPlugin({ zoomNoteId, onZoomNoteIdChange, onZoomPathChange }: ZoomPluginProps) {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();
  const lastPathRef = useRef<NotePathItem[] | null>(null);
  const zoomNoteIdRef = useRef<string | null>(resolveZoomNoteId(zoomNoteId));
  const lastHoverRef = useRef<HTMLElement | null>(null);
  const zoomParentTrackedRef = useRef(false);
  const zoomParentKeyRef = useRef<string | null>(null);
  const skipZoomSelectionRef = useRef(false);

  useEffect(() => {
    zoomNoteIdRef.current = resolveZoomNoteId(zoomNoteId);
    const noteId = zoomNoteIdRef.current;
    if (!noteId) {
      zoomParentTrackedRef.current = false;
      zoomParentKeyRef.current = null;
      setSelectionBoundary(editor, null);
      return;
    }

    let boundaryKey: string | null = null;
    editor.getEditorState().read(() => {
      const root = $findNoteById(noteId);
      if (!root) {
        zoomParentTrackedRef.current = false;
        zoomParentKeyRef.current = null;
        return;
      }
      const parent = getParentContentItem(root);
      zoomParentTrackedRef.current = true;
      zoomParentKeyRef.current = parent?.getKey() ?? null;
      boundaryKey = root.getKey();
    });
    setSelectionBoundary(editor, boundaryKey);
  }, [editor, zoomNoteId]);

  const handleBulletPointerDown = useCallback(
    (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const listItem = target.closest<HTMLElement>('li.list-item');
      if (!listItem) {
        return;
      }

      if (!isBulletHit(listItem, event)) {
        return;
      }

      const noteId = editor.read(() => {
        const node = $getNearestNodeFromDOMNode(listItem);
        if (!node) {
          return null;
        }
        const listNode = findNearestListItem(node);
        if (!listNode || isChildrenWrapper(listNode)) {
          return null;
        }
        const contentItem = getContentListItem(listNode);
        return $getNoteId(contentItem);
      });

      if (!noteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      onZoomNoteIdChange?.(noteId);

      editor.update(() => {
        const targetItem = $findNoteById(noteId);
        if (!targetItem) {
          return;
        }
        $selectItemEdge(targetItem, 'start');
      }, { tag: 'zoom:bullet' });

      editor.focus();
    },
    [editor, onZoomNoteIdChange]
  );

  const handleBulletPointerMove = useCallback((event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    const listItem = target?.closest<HTMLElement>('li.list-item') ?? null;
    if (!listItem) {
      if (lastHoverRef.current) {
        delete lastHoverRef.current.dataset.zoomBulletHover;
        lastHoverRef.current = null;
      }
      return;
    }

    if (isBulletHit(listItem, event)) {
      const canZoom = editor.read(() => {
        const node = $getNearestNodeFromDOMNode(listItem);
        if (!node) {
          return false;
        }
        const listNode = findNearestListItem(node);
        return Boolean(listNode && !isChildrenWrapper(listNode));
      });

      if (!canZoom) {
        if (lastHoverRef.current) {
          delete lastHoverRef.current.dataset.zoomBulletHover;
          lastHoverRef.current = null;
        }
        return;
      }

      if (lastHoverRef.current !== listItem) {
        if (lastHoverRef.current) {
          delete lastHoverRef.current.dataset.zoomBulletHover;
        }
        listItem.dataset.zoomBulletHover = 'true';
        lastHoverRef.current = listItem;
      }
      return;
    }

    if (lastHoverRef.current) {
      delete lastHoverRef.current.dataset.zoomBulletHover;
      lastHoverRef.current = null;
    }
  }, [editor]);

  const handlePointerLeave = useCallback(() => {
    if (lastHoverRef.current) {
      delete lastHoverRef.current.dataset.zoomBulletHover;
      lastHoverRef.current = null;
    }
  }, []);

  useEffect(() => {
    let currentRoot = editor.getRootElement();
    if (currentRoot) {
      currentRoot.addEventListener('pointerdown', handleBulletPointerDown);
      currentRoot.addEventListener('pointermove', handleBulletPointerMove);
      currentRoot.addEventListener('pointerleave', handlePointerLeave);
    }

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRoot) => {
      if (previousRoot) {
        previousRoot.removeEventListener('pointerdown', handleBulletPointerDown);
        previousRoot.removeEventListener('pointermove', handleBulletPointerMove);
        previousRoot.removeEventListener('pointerleave', handlePointerLeave);
      }
      currentRoot = rootElement ?? null;
      if (currentRoot) {
        currentRoot.addEventListener('pointerdown', handleBulletPointerDown);
        currentRoot.addEventListener('pointermove', handleBulletPointerMove);
        currentRoot.addEventListener('pointerleave', handlePointerLeave);
      }
    });

    return () => {
      unregisterRootListener();
      if (currentRoot) {
        currentRoot.removeEventListener('pointerdown', handleBulletPointerDown);
        currentRoot.removeEventListener('pointermove', handleBulletPointerMove);
        currentRoot.removeEventListener('pointerleave', handlePointerLeave);
      }
      if (lastHoverRef.current) {
        delete lastHoverRef.current.dataset.zoomBulletHover;
        lastHoverRef.current = null;
      }
    };
  }, [editor, handleBulletPointerDown, handleBulletPointerMove, handlePointerLeave]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      const noteId = zoomNoteIdRef.current;
      const shouldConsiderAutoZoom =
        Boolean(noteId) && !tags.has(COLLABORATION_TAG) && !tags.has('test-bridge-load');
      const prevParentKey = zoomParentKeyRef.current;
      const parentWasTracked = zoomParentTrackedRef.current;

      const resolved = editorState.read(() => {
        const selection = $getSelection();
        const selectionItem =
          $isRangeSelection(selection) && selection.isCollapsed()
            ? resolveContentItem(selection.anchor.getNode())
            : null;
        const selectionKey = selectionItem?.getKey() ?? null;
        if (!noteId) {
          return {
            root: null,
            path: [] as NotePathItem[],
            nextZoomNoteId: undefined,
            parentKey: null,
            boundaryKey: null,
            scrollTargetKey: null as string | null,
          };
        }

        const root = $findNoteById(noteId);
        if (!root) {
          return {
            root: null,
            path: [] as NotePathItem[],
            nextZoomNoteId: undefined,
            parentKey: null,
            boundaryKey: null,
            scrollTargetKey: null as string | null,
          };
        }

        const path = $getNoteAncestorPath(root);
        const parent = getParentContentItem(root);
        const parentKey = parent?.getKey() ?? null;
        let nextZoomNoteId: string | null | undefined;
        let scrollTargetKey: string | null = null;

        if (shouldConsiderAutoZoom) {
          const parentChanged = parentWasTracked && prevParentKey !== parentKey;
          if (parentChanged) {
            const parentId = parent ? $getNoteId(parent) : null;
            nextZoomNoteId = parentId ?? null;
            scrollTargetKey = selectionKey;
          } else {
            const dirtyItems = $collectDirtyContentItems(dirtyElements, dirtyLeaves);
            const outsideItems = dirtyItems.filter(
              (item) => !isDescendantOf(item, root) && !isDescendantOf(root, item)
            );

            if (outsideItems.length > 0) {
              scrollTargetKey = outsideItems[0]?.getKey() ?? null;
              if (selectionKey) {
                const selectionDirty = dirtyItems.some((item) => item.getKey() === selectionKey);
                if (selectionDirty) {
                  scrollTargetKey = selectionKey;
                }
              }
              const ancestor = resolveZoomAncestor(root, outsideItems);
              const ancestorId = ancestor ? $getNoteId(ancestor) : null;
              nextZoomNoteId = ancestorId ?? null;
            }
          }
        }

        return {
          root,
          path,
          nextZoomNoteId,
          parentKey,
          boundaryKey: root.getKey(),
          scrollTargetKey,
        };
      });

      if (resolved.root) {
        zoomParentTrackedRef.current = true;
        zoomParentKeyRef.current = resolved.parentKey ?? null;
      } else {
        zoomParentTrackedRef.current = false;
        zoomParentKeyRef.current = null;
      }

      if (zoomNoteIdRef.current && !resolved.root && collab.hydrated) {
        skipZoomSelectionRef.current = true;
        onZoomNoteIdChange?.(null);
      }

      if (
        resolved.nextZoomNoteId !== undefined &&
        resolved.nextZoomNoteId !== zoomNoteIdRef.current
      ) {
        if (resolved.scrollTargetKey) {
          setZoomScrollTarget(editor, resolved.scrollTargetKey);
        }
        skipZoomSelectionRef.current = true;
        onZoomNoteIdChange?.(resolved.nextZoomNoteId ?? null);
        return;
      }

      setSelectionBoundary(editor, resolved.boundaryKey ?? null);

      if (!isPathEqual(resolved.path, lastPathRef.current)) {
        lastPathRef.current = resolved.path;
        onZoomPathChange?.(resolved.path);
      }
    });

    return () => unregister();
  }, [collab.hydrated, editor, onZoomNoteIdChange, onZoomPathChange]);

  useEffect(() => {
    if (skipZoomSelectionRef.current) {
      skipZoomSelectionRef.current = false;
      return;
    }

    const noteId = resolveZoomNoteId(zoomNoteId);
    if (!noteId) {
      return;
    }

    editor.update(() => {
      const targetItem = $findNoteById(noteId);
      if (!targetItem) {
        return;
      }
      $selectItemEdge(targetItem, 'start');
    }, { tag: 'zoom:caret' });
  }, [editor, zoomNoteId]);

  return null;
}
