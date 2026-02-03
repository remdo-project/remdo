import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';

const FOLD_HOVER_ATTR = 'foldHover';

const resolveHoverTargetByY = (root: HTMLElement, clientY: number): HTMLElement | null => {
  const items = root.querySelectorAll<HTMLElement>('li.list-item:not(.list-nested-item)');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return item;
    }
  }
  return null;
};

export function FoldHoverPlugin() {
  const [editor] = useLexicalComposerContext();
  const lastHoverRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const setHover = (next: HTMLElement | null) => {
      if (next === lastHoverRef.current) {
        return;
      }

      if (lastHoverRef.current) {
        delete lastHoverRef.current.dataset[FOLD_HOVER_ATTR];
      }

      if (next) {
        next.dataset[FOLD_HOVER_ATTR] = 'true';
      }

      lastHoverRef.current = next;
    };

    const clearHover = () => {
      setHover(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const root = editor.getRootElement();
      if (!root) {
        clearHover();
        return;
      }

      const surfaceRect = root.getBoundingClientRect();
      if (
        event.clientX < surfaceRect.left ||
        event.clientX > surfaceRect.right ||
        event.clientY < surfaceRect.top ||
        event.clientY > surfaceRect.bottom
      ) {
        clearHover();
        return;
      }

      if (lastHoverRef.current) {
        const rect = lastHoverRef.current.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          return;
        }
      }

      const eventTarget = event.target;
      const candidate =
        eventTarget instanceof HTMLElement
          ? eventTarget.closest<HTMLElement>('li.list-item:not(.list-nested-item)')
          : null;
      const nextHover = candidate ?? resolveHoverTargetByY(root, event.clientY);

      setHover(nextHover);
    };

    const handlePointerLeave = () => {
      clearHover();
    };

    let currentRoot = editor.getRootElement();
    if (currentRoot) {
      currentRoot.addEventListener('pointermove', handlePointerMove);
      currentRoot.addEventListener('pointerleave', handlePointerLeave);
    }

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRoot) => {
      if (previousRoot) {
        previousRoot.removeEventListener('pointermove', handlePointerMove);
        previousRoot.removeEventListener('pointerleave', handlePointerLeave);
      }

      currentRoot = rootElement;
      if (currentRoot) {
        currentRoot.addEventListener('pointermove', handlePointerMove);
        currentRoot.addEventListener('pointerleave', handlePointerLeave);
      }
    });

    return () => {
      unregisterRootListener();
      if (currentRoot) {
        currentRoot.removeEventListener('pointermove', handlePointerMove);
        currentRoot.removeEventListener('pointerleave', handlePointerLeave);
      }
      clearHover();
    };
  }, [editor]);

  return null;
}
