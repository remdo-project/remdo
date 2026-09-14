import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentCapabilitiesSnapshot, DocumentSession } from '#note-sdk';

import { useCoarsePointer } from '#client/browser/useCoarsePointer';
import { useVisualViewportBottom } from '#client/browser/useVisualViewportBottom';
import type { MobileActionId } from './actions';
import { runMobileAction } from './actions';
import type { LaidOutAction } from './toolbar-layout';
import { resolveToolbarLayout } from './toolbar-layout';

// Glyphs and accessible labels — the toolbar surface's own inventory.
const ACTION_META: Record<MobileActionId, { icon: string; label: string }> = {
  indent: { icon: '⇥', label: 'Indent' },
  outdent: { icon: '⇤', label: 'Outdent' },
  moveUp: { icon: '↑', label: 'Move up' },
  moveDown: { icon: '↓', label: 'Move down' },
  done: { icon: '✓', label: 'Toggle done' },
  fold: { icon: '▸', label: 'Toggle fold' },
  delete: { icon: '🗑', label: 'Delete' },
  undo: { icon: '↺', label: 'Undo' },
  redo: { icon: '↻', label: 'Redo' },
  menu: { icon: '⋯', label: 'Note menu' },
};

const UNAVAILABLE_CAPABILITIES: DocumentCapabilitiesSnapshot = Object.freeze({
  focus: Object.freeze({ canToggleFold: false }),
  selection: Object.freeze({ canDelete: false }),
  history: Object.freeze({ canUndo: false, canRedo: false }),
});

function disabledIds(capabilities: DocumentCapabilitiesSnapshot): Set<MobileActionId> {
  const set = new Set<MobileActionId>();
  if (!capabilities.focus.canToggleFold) set.add('fold');
  if (!capabilities.selection.canDelete) set.add('delete');
  if (!capabilities.history.canUndo) set.add('undo');
  if (!capabilities.history.canRedo) set.add('redo');
  return set;
}

interface MobileActionToolbarProps {
  session: Pick<DocumentSession, 'capabilities' | 'focus' | 'selection' | 'history'>;
  portalRoot: Element | null;
  focusEditor: () => void;
  openNoteMenu: () => void;
}

/** Desktop sessions never subscribe to toolbar capabilities merely to return null. */
export function MobileActionToolbar(props: MobileActionToolbarProps) {
  const isCoarsePointer = useCoarsePointer();
  if (!isCoarsePointer || !props.portalRoot) {
    return null;
  }
  return <VisibleMobileActionToolbar {...props} portalRoot={props.portalRoot} />;
}

function VisibleMobileActionToolbar({
  session,
  portalRoot,
  focusEditor,
  openNoteMenu,
}: MobileActionToolbarProps & { portalRoot: Element }) {
  const visualViewportBottom = useVisualViewportBottom();
  const capabilityState = useSyncExternalStore(
    session.capabilities.subscribe,
    session.capabilities.getSnapshot,
    session.capabilities.getSnapshot,
  );
  const capabilities = capabilityState.status === 'ready'
    ? capabilityState.data
    : UNAVAILABLE_CAPABILITIES;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });

  // Show an edge fade only where more content exists.
  const syncFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const overflowing = max > 0.5;
    const start = overflowing && el.scrollLeft > 0.5;
    const end = overflowing && el.scrollLeft < max - 0.5;
    setFade((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) {
        syncFade();
      }
    });
    const observer = new ResizeObserver(syncFade);
    observer.observe(el);
    void globalThis.document.fonts.ready.then(() => {
      if (active) {
        syncFade();
      }
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [syncFade]);

  const layout = resolveToolbarLayout(disabledIds(capabilities));

  // Run on click (a completed tap), not pointerdown: a swipe cancels the click.
  const onActionClick = (action: LaidOutAction) => () => {
    if (action.disabled) {
      return;
    }
    runMobileAction(session, action.id, openNoteMenu);
    focusEditor();
  };

  // Keep the editor focused so a tap does not dismiss the on-screen keyboard.
  const preserveEditorFocus = (event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault();

  const renderButton = (action: LaidOutAction) => {
    const meta = ACTION_META[action.id];
    return (
      <button
        key={action.id}
        type="button"
        className="mobile-action-toolbar__button"
        aria-label={meta.label}
        aria-disabled={action.disabled || undefined}
        onMouseDown={preserveEditorFocus}
        onClick={onActionClick(action)}
      >
        <span aria-hidden="true">{meta.icon}</span>
      </button>
    );
  };

  return createPortal(
    <div
      className="mobile-action-toolbar"
      role="toolbar"
      aria-label="Note actions"
      contentEditable={false}
      style={
        visualViewportBottom === null
          ? undefined
          : {
              bottom: 'auto',
              top: `${visualViewportBottom}px`,
              transform: 'translateY(-100%)',
            }
      }
    >
      <div
        className={`mobile-action-toolbar__scroll-shell${fade.start ? ' fade-start' : ''}${
          fade.end ? ' fade-end' : ''
        }`}
      >
        <div className="mobile-action-toolbar__scroll" ref={scrollRef} onScroll={syncFade}>
          {layout.scroll.map(renderButton)}
        </div>
      </div>
      <div className="mobile-action-toolbar__divider" aria-hidden="true" />
      <div className="mobile-action-toolbar__pinned">{layout.pinned.map(renderButton)}</div>
    </div>,
    portalRoot,
  );
}
