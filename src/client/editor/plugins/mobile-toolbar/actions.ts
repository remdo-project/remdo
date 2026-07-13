import type { LexicalCommand, LexicalEditor } from 'lexical';
import { $getNodeByKey, REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import { $isListItemNode } from '@lexical/list';

import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OPEN_NOTE_MENU_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
  SET_NOTE_FOLD_COMMAND,
} from '#client/editor/commands';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { $resolveZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { $canDeleteFocusedOrSelectedNotes } from '#client/editor/outline/selection/delete-selection';
import { noteHasChildren } from '#client/editor/outline/selection/tree';

// The toolbar's action set, in display order (docs/outliner/mobile-toolbar.md).
// Icons and labels are the surface's own inventory; behavior reuses existing
// operations via the dispatch below.
export type MobileActionId =
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'done'
  | 'fold'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'menu';

// Actions that map directly to a no-payload command. `done` and `fold` need a
// payload, so they are handled explicitly in runMobileAction.
const DIRECT_COMMANDS: Partial<Record<MobileActionId, LexicalCommand<undefined>>> = {
  indent: INDENT_NOTES_COMMAND,
  outdent: OUTDENT_NOTES_COMMAND,
  moveUp: REORDER_NOTES_UP_COMMAND,
  moveDown: REORDER_NOTES_DOWN_COMMAND,
  delete: DELETE_SELECTED_NOTES_COMMAND,
  undo: UNDO_COMMAND,
  redo: REDO_COMMAND,
};

/**
 * Run a toolbar action against the editor's current selection. Every action is
 * a single command dispatch reusing existing wiring; the caller is a pointer
 * handler, so this is invoked outside any editor update.
 */
export function runMobileAction(editor: LexicalEditor, id: MobileActionId): void {
  if (id === 'done') {
    editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
    return;
  }
  if (id === 'fold') {
    const noteItemKey = editor.read(() => $resolveFoldableNoteKey(editor));
    if (noteItemKey) {
      editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey });
    }
    return;
  }
  if (id === 'menu') {
    const noteItemKey = editor.read(() => $resolveFocusNoteKey(editor));
    if (noteItemKey) {
      editor.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteItemKey });
    }
    return;
  }
  editor.dispatchCommand(DIRECT_COMMANDS[id]!, undefined);
}

// The focus note's key when it is a foldable target: a note with children that
// is not the current zoom root (folding the zoom root would hide the zoomed-in
// content, which the note menu forbids). Call inside editor.read/update.
// Returns null when fold does not apply. Both the capability check and the fold
// dispatch go through this, so the disabled state and the action agree.
function $resolveFoldableNoteKey(editor: LexicalEditor): string | null {
  const key = $resolveFocusNoteKey(editor);
  const note = key ? $getNodeByKey(key) : null;
  if (!$isListItemNode(note) || !noteHasChildren(note)) {
    return null;
  }
  if (key === $resolveZoomRoot(editor)?.getKey()) {
    return null;
  }
  return key;
}

// Capability of the actions the spec disables (fold, delete). Undo/redo track
// their own capability through CAN_UNDO/CAN_REDO command events, not here.
export interface SelectionCapability {
  fold: boolean;
  delete: boolean;
}

/** Compute fold/delete capability for the current selection. Non-mutating. */
export function resolveSelectionCapability(editor: LexicalEditor): SelectionCapability {
  return editor.read(() => ({
    fold: $resolveFoldableNoteKey(editor) !== null,
    delete: $canDeleteFocusedOrSelectedNotes(editor),
  }));
}
