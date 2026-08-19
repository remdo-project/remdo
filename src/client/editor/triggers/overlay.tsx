import type { LexicalEditor } from 'lexical';
import type { Placement } from 'react-aria';
import { useOverlayPosition } from 'react-aria';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface EditorPopupOverlayProps {
  editor: LexicalEditor;
  portalRoot: HTMLElement;
  getTargetRect: () => DOMRect | null;
  placement?: Placement;
  offset?: number;
  className?: string;
  'aria-label'?: string;
  onMouseDown?: MouseEventHandler<HTMLElement>;
  onClose?: () => void;
  isTriggerPicker?: boolean;
  closeOnInteractOutside?: boolean;
  isOutsidePressExempt?: (element: Element) => boolean;
  children: ReactNode;
}

export function EditorPopupOverlay({
  editor,
  portalRoot,
  getTargetRect,
  placement = 'bottom start',
  offset = 6,
  className,
  'aria-label': ariaLabel,
  onMouseDown,
  onClose,
  isTriggerPicker,
  closeOnInteractOutside = false,
  isOutsidePressExempt,
  children,
}: EditorPopupOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(editor.getRootElement());
  triggerRef.current = editor.getRootElement();
  const lastTargetRectRef = useRef<DOMRect | null>(null);

  const { overlayProps, updatePosition } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement,
    offset,
    isOpen: true,
    maxHeight: typeof window === 'undefined' ? 800 : window.innerHeight,
    onClose: null,
    shouldFlip: true,
    getTargetRect: () => {
      const rect = getTargetRect();
      if (rect) {
        lastTargetRectRef.current = rect;
        return rect;
      }
      return lastTargetRectRef.current;
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

  useEffect(() => {
    if (!closeOnInteractOutside) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (overlayRef.current?.contains(target) || isOutsidePressExempt?.(target)) {
        return;
      }
      onClose?.();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [closeOnInteractOutside, isOutsidePressExempt, onClose]);

  if (!triggerRef.current) {
    return null;
  }

  return createPortal(
    <div
      {...overlayProps}
      aria-label={ariaLabel}
      className={className}
      data-trigger-picker={isTriggerPicker ? '' : undefined}
      ref={overlayRef}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>,
    portalRoot
  );
}
