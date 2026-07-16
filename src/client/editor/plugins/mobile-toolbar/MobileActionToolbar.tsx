import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { useCoarsePointer } from '#client/runtime/useCoarsePointer';
import { useVisualViewportBottom } from '#client/runtime/useVisualViewportBottom';
import type { MobileActionId, SelectionCapability } from './actions';
import { resolveSelectionCapability, runMobileAction } from './actions';
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

// Enabled-state for the actions the spec disables when they cannot apply
// (fold, delete from the selection capability; undo, redo from CAN_UNDO/REDO).
type ToolbarState = SelectionCapability & { undo: boolean; redo: boolean };

const INITIAL_STATE: ToolbarState = { fold: true, delete: false, undo: false, redo: false };

function disabledIds(state: ToolbarState): Set<MobileActionId> {
  const set = new Set<MobileActionId>();
  if (!state.fold) set.add('fold');
  if (!state.delete) set.add('delete');
  if (!state.undo) set.add('undo');
  if (!state.redo) set.add('redo');
  return set;
}

function resolvePortalRoot(editor: LexicalEditor): Element | null {
  const root = editor.getRootElement();
  return root ? root.closest('.editor-container') : null;
}

export function MobileActionToolbar() {
  const [editor] = useLexicalComposerContext();
  const isCoarsePointer = useCoarsePointer();
  const visualViewportBottom = useVisualViewportBottom();
  const [portalRoot, setPortalRoot] = useState<Element | null>(() => resolvePortalRoot(editor));
  const [state, setState] = useState<ToolbarState>(INITIAL_STATE);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });

  useEffect(
    () => editor.registerRootListener(() => setPortalRoot(resolvePortalRoot(editor))),
    [editor]
  );

  useEffect(() => {
    if (!isCoarsePointer) {
      return;
    }
    installOutlineSelectionHelpers(editor);

    let active = true;
    const syncCapability = () => {
      if (!active) {
        return;
      }
      const { fold, delete: canDelete } = resolveSelectionCapability(editor);
      setState((prev) =>
        prev.fold === fold && prev.delete === canDelete ? prev : { ...prev, fold, delete: canDelete }
      );
    };

    queueMicrotask(syncCapability);

    const unregister = mergeRegister(
      editor.registerUpdateListener(syncCapability),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (canUndo) => {
          setState((prev) => (prev.undo === canUndo ? prev : { ...prev, undo: canUndo }));
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (canRedo) => {
          setState((prev) => (prev.redo === canRedo ? prev : { ...prev, redo: canRedo }));
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );

    return () => {
      active = false;
      unregister();
    };
  }, [editor, isCoarsePointer]);

  // Show an edge fade only on a side that actually has more content, so the
  // scrolling group signals it scrolls rather than presenting a static edge.
  const syncFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const overflowing = max > 0.5;
    const start = overflowing && el.scrollLeft > 0.5;
    const end = overflowing && el.scrollLeft < max - 0.5;
    // Bail when unchanged: onScroll fires on nearly every frame of a swipe, so a
    // fresh object each time would re-render the whole toolbar for no change.
    setFade((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  const visible = isCoarsePointer && portalRoot !== null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!visible || !el) {
      return;
    }
    // The row rests at its leading edge (first action visible), so no initial
    // scroll positioning is needed. Seed the fade explicitly (deferred to keep
    // the effect body free of a synchronous set-state), rather than relying on
    // the ResizeObserver's first callback — which isn't guaranteed by every
    // ResizeObserver (the test stub fires nothing). A ResizeObserver then
    // re-syncs when the scroll element's box changes — rotation, or the pinned
    // group widening or narrowing (Undo showing/hiding). It observes the
    // border-box, so a content-only reflow that widens the buttons without
    // resizing the element (a late glyph/font swap) would not fire it; re-sync
    // once fonts settle to cover that case too. The result: the fade never goes
    // stale — shown when the row no longer scrolls, missing when it newly does.
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
  }, [visible, syncFade]);

  if (!visible) {
    return null;
  }

  const layout = resolveToolbarLayout(disabledIds(state));

  // Run on click (a completed tap), not pointerdown: the row scrolls
  // horizontally, and acting on pointerdown would fire the action mid-swipe and
  // block the native scroll gesture. A swipe cancels the click.
  const onActionClick = (action: LaidOutAction) => () => {
    if (action.disabled) {
      return;
    }
    runMobileAction(editor, action.id);
    editor.focus();
  };

  // Prevent focus leaving the editor on a tap so the keyboard stays up.
  // mousedown is synthesized only for a tap, not while scrolling, so this
  // preserves focus without blocking the horizontal swipe.
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
    portalRoot
  );
}
