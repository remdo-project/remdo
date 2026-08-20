import type { LexicalEditor } from 'lexical';
import type { Placement } from 'react-aria';
import { useOverlayPosition } from 'react-aria';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface EditorPopupOverlayProps {
  editor: LexicalEditor;
  portalRoot: HTMLElement;
  getTargetRect: () => DOMRect | null;
  placement?: Placement;
  offset?: number;
  className?: string;
  children: ReactNode;
}

export function EditorPopupOverlay({
  editor,
  portalRoot,
  getTargetRect,
  placement = 'bottom start',
  offset = 6,
  className,
  children,
}: EditorPopupOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  // useOverlayPosition requires a trigger element; the live box is getTargetRect.
  const triggerRef = useRef<Element | null>(editor.getRootElement());
  triggerRef.current = editor.getRootElement();
  const lastTargetRectRef = useRef<DOMRect | null>(null);

  const { overlayProps, updatePosition } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement,
    offset,
    isOpen: true,
    maxHeight: window.innerHeight,
    onClose: null,
    shouldFlip: true,
    getTargetRect: () => {
      const rect = getTargetRect();
      if (rect) {
        lastTargetRectRef.current = rect;
        return rect;
      }
      return lastTargetRectRef.current ?? new DOMRect();
    },
  });

  useEffect(() => {
    const update = () => {
      updatePosition();
    };
    const root = editor.getRootElement();
    root?.addEventListener('scroll', update, true);
    globalThis.addEventListener('resize', update);
    globalThis.addEventListener('scroll', update, true);
    update();
    return () => {
      root?.removeEventListener('scroll', update, true);
      globalThis.removeEventListener('resize', update);
      globalThis.removeEventListener('scroll', update, true);
    };
  }, [editor, updatePosition]);

  if (!triggerRef.current) {
    return null;
  }

  return createPortal(
    <div
      {...overlayProps}
      className={className}
      ref={overlayRef}
    >
      {children}
    </div>,
    portalRoot
  );
}
