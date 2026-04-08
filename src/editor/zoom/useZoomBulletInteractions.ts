import { useCallback, useEffect, useRef } from 'react';
import type { LexicalEditor } from 'lexical';
import { isBulletHit, isCheckboxHit } from '@/editor/outline/bullet-hit-test';
import {
  $resolveContentNoteFromDOMNode,
  $resolveNoteIdFromDOMNode,
} from '@/editor/outline/note-context';
import { ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';

export function useZoomBulletInteractions(editor: LexicalEditor) {
  const lastBulletHoverRef = useRef<HTMLElement | null>(null);
  const lastCheckboxHoverRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef(editor.getRootElement());

  const clearBulletHover = useCallback(() => {
    if (!lastBulletHoverRef.current) {
      return;
    }
    delete lastBulletHoverRef.current.dataset.zoomBulletHover;
    lastBulletHoverRef.current = null;
  }, []);

  const clearCheckboxHover = useCallback(() => {
    if (!lastCheckboxHoverRef.current) {
      return;
    }
    delete lastCheckboxHoverRef.current.dataset.zoomCheckboxHover;
    lastCheckboxHoverRef.current = null;
  }, []);

  const handlePointerLeave = useCallback(() => {
    clearBulletHover();
    clearCheckboxHover();
  }, [clearBulletHover, clearCheckboxHover]);

  const handleBulletPointerDown = useCallback(
    (event: PointerEvent | MouseEvent, listItem: HTMLElement | null) => {
      if (!listItem || !isBulletHit(listItem, event as PointerEvent)) {
        return;
      }

      const noteId = editor.read(() => $resolveNoteIdFromDOMNode(listItem));
      if (!noteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId });
    },
    [editor]
  );

  const handleBulletPointerMove = useCallback(
    (event: PointerEvent | MouseEvent, listItem: HTMLElement | null) => {
      if (!listItem) {
        handlePointerLeave();
        return;
      }

      const canZoom = editor.read(() => Boolean($resolveContentNoteFromDOMNode(listItem)));
      if (!canZoom) {
        handlePointerLeave();
        return;
      }

      if (isBulletHit(listItem, event as PointerEvent)) {
        if (lastBulletHoverRef.current !== listItem) {
          clearBulletHover();
          listItem.dataset.zoomBulletHover = 'true';
          lastBulletHoverRef.current = listItem;
        }
        clearCheckboxHover();
        return;
      }

      if (isCheckboxHit(listItem, event as PointerEvent)) {
        if (lastCheckboxHoverRef.current !== listItem) {
          clearCheckboxHover();
          listItem.dataset.zoomCheckboxHover = 'true';
          lastCheckboxHoverRef.current = listItem;
        }
        clearBulletHover();
        return;
      }

      handlePointerLeave();
    },
    [clearBulletHover, clearCheckboxHover, editor, handlePointerLeave]
  );

  useEffect(() => {
    let currentRoot = editor.getRootElement();
    rootRef.current = currentRoot;

    const resolveListItemFromEvent = (event: PointerEvent | MouseEvent) => {
      const root = rootRef.current;
      if (!root) {
        return null;
      }
      const eventTarget = event.target;
      if (eventTarget instanceof Element && !root.contains(eventTarget)) {
        return null;
      }

      const resolveFromElement = (element: Element | null): HTMLElement | null =>
        element ? element.closest<HTMLElement>('li.list-item') : null;

      let listItem = eventTarget instanceof Element ? resolveFromElement(eventTarget) : null;
      if (!listItem && typeof document.elementsFromPoint === 'function') {
        for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
          listItem = resolveFromElement(element);
          if (listItem) {
            break;
          }
        }
      }
      if (!listItem) {
        listItem = resolveFromElement(document.elementFromPoint(event.clientX, event.clientY));
      }
      return listItem && root.contains(listItem) ? listItem : null;
    };

    const handleDocumentPointerMove = (event: PointerEvent | MouseEvent) => {
      handleBulletPointerMove(event, resolveListItemFromEvent(event));
    };

    const handleDocumentPointerDown = (event: PointerEvent | MouseEvent) => {
      const listItem = resolveListItemFromEvent(event);
      if (!listItem) {
        return;
      }
      handleBulletPointerDown(event, listItem);
    };

    document.addEventListener('pointermove', handleDocumentPointerMove);
    document.addEventListener('pointerdown', handleDocumentPointerDown);

    const unregisterRootListener = editor.registerRootListener((rootElement) => {
      currentRoot = rootElement ?? null;
      rootRef.current = currentRoot;
    });

    return () => {
      unregisterRootListener();
      document.removeEventListener('pointermove', handleDocumentPointerMove);
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      handlePointerLeave();
    };
  }, [editor, handleBulletPointerDown, handleBulletPointerMove, handlePointerLeave]);
}
