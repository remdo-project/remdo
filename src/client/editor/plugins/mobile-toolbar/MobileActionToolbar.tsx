import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { useCoarsePointer } from '#client/runtime/useCoarsePointer';
import { useKeyboardInset } from '#client/runtime/useKeyboardInset';
import type { MobileActionId } from './actions';
import { resolveSelectionCapability, runMobileAction } from './actions';

interface ActionSpec {
  id: MobileActionId;
  icon: string;
  label: string;
}

// Display order per docs/outliner/mobile-toolbar.md. Glyphs and labels are the
// surface's own inventory.
const ACTIONS: ActionSpec[] = [
  { id: 'indent', icon: '⇥', label: 'Indent' },
  { id: 'outdent', icon: '⇤', label: 'Outdent' },
  { id: 'moveUp', icon: '↑', label: 'Move up' },
  { id: 'moveDown', icon: '↓', label: 'Move down' },
  { id: 'done', icon: '✓', label: 'Toggle done' },
  { id: 'fold', icon: '▸', label: 'Toggle fold' },
  { id: 'delete', icon: '🗑', label: 'Delete' },
  { id: 'undo', icon: '↺', label: 'Undo' },
  { id: 'redo', icon: '↻', label: 'Redo' },
];

interface ToolbarState {
  fold: boolean;
  delete: boolean;
  undo: boolean;
  redo: boolean;
}

const INITIAL_STATE: ToolbarState = { fold: true, delete: false, undo: false, redo: false };

// Actions the spec disables when they cannot apply; every other action stays
// enabled and no-ops.
function isDisabled(id: MobileActionId, state: ToolbarState): boolean {
  switch (id) {
    case 'fold':
      return !state.fold;
    case 'delete':
      return !state.delete;
    case 'undo':
      return !state.undo;
    case 'redo':
      return !state.redo;
    default:
      return false;
  }
}

function resolvePortalRoot(editor: LexicalEditor): Element | null {
  const root = editor.getRootElement();
  return root ? root.closest('.editor-container') : null;
}

export function MobileActionToolbar() {
  const [editor] = useLexicalComposerContext();
  const isCoarsePointer = useCoarsePointer();
  const keyboardInset = useKeyboardInset();
  const portalRoot = resolvePortalRoot(editor);
  const [state, setState] = useState<ToolbarState>(INITIAL_STATE);

  useEffect(() => {
    if (!isCoarsePointer) {
      return;
    }
    installOutlineSelectionHelpers(editor);

    const syncCapability = () => {
      const capability = resolveSelectionCapability(editor);
      setState((prev) => ({ ...prev, fold: capability.fold, delete: capability.delete }));
    };

    // Seed capability for the current selection without a synchronous
    // set-state in the effect body; updates keep it in sync thereafter.
    queueMicrotask(syncCapability);

    return mergeRegister(
      editor.registerUpdateListener(syncCapability),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (canUndo) => {
          setState((prev) => ({ ...prev, undo: canUndo }));
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (canRedo) => {
          setState((prev) => ({ ...prev, redo: canRedo }));
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor, isCoarsePointer]);

  if (!isCoarsePointer || !portalRoot) {
    return null;
  }

  const onActionPointerDown = (id: MobileActionId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Keep the editor focused so the keyboard stays up and actions chain.
    event.preventDefault();
    event.stopPropagation();
    runMobileAction(editor, id);
    editor.focus();
  };

  return createPortal(
    <div
      className="mobile-action-toolbar"
      role="toolbar"
      aria-label="Note actions"
      contentEditable={false}
      style={keyboardInset > 0 ? { bottom: `${keyboardInset}px` } : undefined}
    >
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className="mobile-action-toolbar__button"
          aria-label={action.label}
          disabled={isDisabled(action.id, state)}
          onPointerDown={onActionPointerDown(action.id)}
        >
          <span aria-hidden="true">{action.icon}</span>
        </button>
      ))}
    </div>,
    portalRoot
  );
}
