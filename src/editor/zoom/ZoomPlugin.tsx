import { $getNearestNodeFromDOMNode } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { isBulletHit } from '@/editor/outline/bullet-hit-test';
import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from '@/editor/plugins/collaboration/CollaborationProvider';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { $findNoteById, $getNoteAncestorPath } from '@/editor/outline/note-traversal';
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

export function ZoomPlugin({ zoomNoteId, onZoomNoteIdChange, onZoomPathChange }: ZoomPluginProps) {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();
  const lastPathRef = useRef<NotePathItem[] | null>(null);
  const zoomNoteIdRef = useRef<string | null>(resolveZoomNoteId(zoomNoteId));
  const lastHoverRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    zoomNoteIdRef.current = resolveZoomNoteId(zoomNoteId);
  }, [zoomNoteId]);

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

      if (listItem.classList.contains('list-nested-item')) {
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
        if (!listNode) {
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

    if (listItem.classList.contains('list-nested-item')) {
      if (lastHoverRef.current) {
        delete lastHoverRef.current.dataset.zoomBulletHover;
        lastHoverRef.current = null;
      }
      return;
    }

    if (isBulletHit(listItem, event)) {
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
  }, []);

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
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      const resolved = editorState.read(() => {
        const noteId = zoomNoteIdRef.current;
        if (!noteId) {
          return { root: null, path: [] as NotePathItem[] };
        }

        const root = $findNoteById(noteId);
        if (!root) {
          return { root: null, path: [] as NotePathItem[] };
        }

        return { root, path: $getNoteAncestorPath(root) };
      });

      if (zoomNoteIdRef.current && !resolved.root && collab.hydrated) {
        onZoomNoteIdChange?.(null);
      }

      if (!isPathEqual(resolved.path, lastPathRef.current)) {
        lastPathRef.current = resolved.path;
        onZoomPathChange?.(resolved.path);
      }
    });

    return () => unregister();
  }, [collab.hydrated, editor, onZoomNoteIdChange, onZoomPathChange]);

  useEffect(() => {
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
