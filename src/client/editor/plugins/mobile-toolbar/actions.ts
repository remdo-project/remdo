import type { LexicalCommand, LexicalEditor } from 'lexical';
import { $getNodeByKey, REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import { $isListItemNode } from '@lexical/list';

import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
  SET_NOTE_FOLD_COMMAND,
} from '#client/editor/commands';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { $canDeleteSelectedNotes } from '#client/editor/outline/selection/delete-selection';
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
  | 'redo';

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
    const noteItemKey = editor.read(() => $resolveFocusNoteKey(editor));
    if (noteItemKey) {
      editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey });
    }
    return;
  }
  editor.dispatchCommand(DIRECT_COMMANDS[id]!, undefined);
}

// Capability of the actions the spec disables (fold, delete). Undo/redo track
// their own capability through CAN_UNDO/CAN_REDO command events, not here.
export interface SelectionCapability {
  fold: boolean;
  delete: boolean;
}

/** Compute fold/delete capability for the current selection. Non-mutating. */
export function resolveSelectionCapability(editor: LexicalEditor): SelectionCapability {
  return editor.read(() => {
    const key = $resolveFocusNoteKey(editor);
    const foldTarget = key ? $getNodeByKey(key) : null;
    return {
      fold: $isListItemNode(foldTarget) ? noteHasChildren(foldTarget) : false,
      delete: $canDeleteSelectedNotes(editor),
    };
  });
}
