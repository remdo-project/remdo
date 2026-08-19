import type { LexicalEditor } from 'lexical';
import type { Placement } from 'react-aria';
import { UNSAFE_PortalProvider } from 'react-aria';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Popover } from 'react-aria-components';

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
  children,
}: EditorPopupOverlayProps) {
  const triggerRef = useRef<Element | null>(editor.getRootElement());
  triggerRef.current = editor.getRootElement();
  const [positionGeneration, setPositionGeneration] = useState(0);

  useEffect(() => {
    const bump = () => {
      setPositionGeneration((generation) => generation + 1);
    };
    const root = editor.getRootElement();
    root?.addEventListener('scroll', bump, true);
    globalThis.addEventListener('resize', bump);
    globalThis.addEventListener('scroll', bump, true);
    return () => {
      root?.removeEventListener('scroll', bump, true);
      globalThis.removeEventListener('resize', bump);
      globalThis.removeEventListener('scroll', bump, true);
    };
  }, [editor]);

  useEffect(() => {
    if (!closeOnInteractOutside) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-note-menu], [data-date-picker], [data-trigger-picker], .note-controls__button--menu')) {
        return;
      }
      onClose?.();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [closeOnInteractOutside, onClose]);

  if (!triggerRef.current) {
    return null;
  }

  return (
    <UNSAFE_PortalProvider getContainer={() => portalRoot}>
      <Popover
        aria-label={ariaLabel}
        className={className}
        data-position-generation={positionGeneration}
        data-trigger-picker={isTriggerPicker ? '' : undefined}
        getTargetRect={(target) => getTargetRect() ?? target.getBoundingClientRect()}
        isKeyboardDismissDisabled
        isNonModal
        isOpen
        offset={offset}
        placement={placement}
        shouldCloseOnInteractOutside={() => false}
        shouldFlip
        shouldSkipAnimation
        triggerRef={triggerRef}
        onMouseDown={onMouseDown}
        onOpenChange={(open) => {
          if (!open) {
            onClose?.();
          }
        }}
      >
        {children}
      </Popover>
    </UNSAFE_PortalProvider>
  );
}
