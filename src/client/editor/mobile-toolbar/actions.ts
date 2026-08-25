import type { LexicalCommand, LexicalEditor } from 'lexical';
import { REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import type { EditorNotes } from '#note-sdk';

import {
  DELETE_SELECTED_NOTES_COMMAND,
  INDENT_NOTES_COMMAND,
  OPEN_NOTE_MENU_COMMAND,
  OUTDENT_NOTES_COMMAND,
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
} from '#client/editor/foundation/commands';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { $canDeleteFocusedOrSelectedNotes } from '#client/editor/outline/selection/delete-selection';

// The toolbar's action set, in display order (docs/specs/outliner/mobile-toolbar.md).
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

// Actions that map directly to a no-payload command. `done` needs a payload and
// `fold` uses the editor-note SDK, so they are handled explicitly in
// runMobileAction. Lexical's own
// UNDO/REDO are LexicalCommand<void> while this repo's commands are
// LexicalCommand<undefined>; both accept an undefined payload, and keeping the
// union (rather than AnyLexicalCommand) still rejects a payload-taking command here.
const DIRECT_COMMANDS: Partial<
  Record<MobileActionId, LexicalCommand<undefined> | LexicalCommand<void>>
> = {
  indent: INDENT_NOTES_COMMAND,
  outdent: OUTDENT_NOTES_COMMAND,
  moveUp: REORDER_NOTES_UP_COMMAND,
  moveDown: REORDER_NOTES_DOWN_COMMAND,
  delete: DELETE_SELECTED_NOTES_COMMAND,
  undo: UNDO_COMMAND,
  redo: REDO_COMMAND,
};

/**
 * Run a toolbar action against the editor's current selection. The caller is a
 * pointer handler, so this is invoked outside any editor update.
 */
export function runMobileAction(
  editor: LexicalEditor,
  notes: EditorNotes,
  id: MobileActionId
): void {
  if (id === 'done') {
    editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
    return;
  }
  if (id === 'fold') {
    notes.focusNote()?.toggleFold();
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

// Capability of the actions the spec disables (fold, delete). Undo/redo track
// their own capability through CAN_UNDO/CAN_REDO command events, not here.
export interface SelectionCapability {
  fold: boolean;
  delete: boolean;
}

/** Compute fold/delete capability for the current selection. Non-mutating. */
export function resolveSelectionCapability(
  editor: LexicalEditor,
  notes: EditorNotes
): SelectionCapability {
  return {
    fold: notes.focusNote()?.canToggleFold() ?? false,
    delete: editor.read(() => $canDeleteFocusedOrSelectedNotes(editor)),
  };
}
