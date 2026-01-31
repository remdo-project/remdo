import { $getNearestNodeFromDOMNode } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { config } from '#config';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from '@/editor/plugins/collaboration/CollaborationProvider';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { $findNoteById, $getNoteAncestorPath } from '@/editor/outline/note-traversal';
import { $getNoteId } from '#lib/editor/note-id-state';

let measureContext: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = () => {
  if (measureContext !== undefined) {
    return measureContext;
  }
  if (typeof document === 'undefined') {
    measureContext = null;
    return measureContext;
  }
  try {
    const canvas = globalThis.document.createElement('canvas');
    measureContext = canvas.getContext('2d');
  } catch {
    measureContext = null;
  }
  return measureContext;
};

const parsePseudoContent = (content: string): string | null => {
  if (content === 'none' || content === 'normal') {
    return null;
  }
  if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
    return content.slice(1, -1);
  }
  return content;
};

const resolvePseudoFont = (style: CSSStyleDeclaration) => {
  if (style.font && style.font !== 'normal') {
    return style.font;
  }
  return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
};

const measureGlyphWidth = (style: CSSStyleDeclaration) => {
  const content = parsePseudoContent(style.content);
  const ctx = getMeasureContext();
  if (!content || !ctx) {
    return null;
  }
  ctx.font = resolvePseudoFont(style);
  const metrics = ctx.measureText(content);
  const width = metrics.width;
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }
  const left = metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight;
  if (Number.isFinite(left) && Number.isFinite(right) && left >= 0 && right >= 0) {
    return {
      width,
      boxLeft: left,
      boxRight: right,
    };
  }
  return {
    width,
    boxLeft: 0,
    boxRight: width,
  };
};

const isBeforeEvent = (element: HTMLElement, event: PointerEvent) => {
  let beforeStyle: CSSStyleDeclaration | null = null;
  const baseStyle = globalThis.getComputedStyle(element);
  if (!config.isTest) {
    try {
      beforeStyle = globalThis.getComputedStyle(element, '::before');
    } catch {
      beforeStyle = null;
    }
  }

  const liRect = element.getBoundingClientRect();
  if (!beforeStyle) {
    const fallbackWidth = Number.parseFloat(baseStyle.paddingLeft);
    if (!Number.isFinite(fallbackWidth) || fallbackWidth <= 0) {
      return false;
    }
    const start = liRect.left;
    const end = start + fallbackWidth;
    return event.clientX >= start && event.clientX <= end;
  }

  const containerWidth = Number.parseFloat(beforeStyle.width);
  const left = Number.parseFloat(beforeStyle.left);
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return false;
  }
  const glyphMetrics = measureGlyphWidth(beforeStyle);
  const baseLeft = liRect.left + (Number.isFinite(left) ? left : 0);
  if (!glyphMetrics) {
    const start = baseLeft;
    const end = start + containerWidth;
    return event.clientX >= start && event.clientX <= end;
  }

  let offset = 0;
  if (containerWidth > glyphMetrics.width) {
    const align = beforeStyle.textAlign;
    if (align === 'center') {
      offset = (containerWidth - glyphMetrics.width) / 2;
    } else if (align === 'right' || align === 'end') {
      offset = containerWidth - glyphMetrics.width;
    }
  }
  const start = baseLeft + offset - glyphMetrics.boxLeft;
  const end = baseLeft + offset + glyphMetrics.boxRight;
  return event.clientX >= start && event.clientX <= end;
};

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

      if (!isBeforeEvent(listItem, event)) {
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

    if (isBeforeEvent(listItem, event)) {
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
