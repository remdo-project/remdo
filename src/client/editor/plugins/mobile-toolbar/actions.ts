import type { LexicalEditor } from 'lexical';
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
import { $resolveContentNoteFromDOMNode } from '#client/editor/outline/note-context';
import { $canDeleteSelectedNotes } from '#client/editor/outline/selection/delete-selection';
import { noteHasChildren } from '#client/editor/outline/selection/tree';

// The toolbar's action set, in display order (docs/outliner/mobile-toolbar.md).
// Icons and labels are the surface's own inventory; behavior reuses existing
// operations via `run`.
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

// Resolve the focused note's Lexical key from the current selection, for the
// per-note fold command. Mirrors NoteMenuPlugin's selection-key resolution.
function resolveSelectedNoteKey(editor: LexicalEditor): string | null {
  let key: string | null = null;
  editor.read(() => {
    const focusKey = editor.selection.get()?.focusKey;
    if (focusKey) {
      key = focusKey;
      return;
    }
    const domSelection = globalThis.getSelection();
    const focusNode = domSelection?.focusNode ?? domSelection?.anchorNode ?? null;
    key = $resolveContentNoteFromDOMNode(focusNode)?.getKey() ?? null;
  });
  return key;
}

/**
 * Run a toolbar action against the editor's current selection. Every action is
 * a single command dispatch reusing existing wiring; the caller is a pointer
 * handler, so this is invoked outside any editor update.
 */
export function runMobileAction(editor: LexicalEditor, id: MobileActionId): void {
  switch (id) {
    case 'indent':
      editor.dispatchCommand(INDENT_NOTES_COMMAND, undefined);
      return;
    case 'outdent':
      editor.dispatchCommand(OUTDENT_NOTES_COMMAND, undefined);
      return;
    case 'moveUp':
      editor.dispatchCommand(REORDER_NOTES_UP_COMMAND, undefined);
      return;
    case 'moveDown':
      editor.dispatchCommand(REORDER_NOTES_DOWN_COMMAND, undefined);
      return;
    case 'done':
      editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
      return;
    case 'fold': {
      const noteItemKey = resolveSelectedNoteKey(editor);
      if (noteItemKey) {
        editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey });
      }
      return;
    }
    case 'delete':
      editor.dispatchCommand(DELETE_SELECTED_NOTES_COMMAND, undefined);
      return;
    case 'undo':
      editor.dispatchCommand(UNDO_COMMAND, undefined);
      return;
    case 'redo':
      editor.dispatchCommand(REDO_COMMAND, undefined);
  }
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
    const key = resolveSelectedNoteKey(editor);
    const foldTarget = key ? $getNodeByKey(key) : null;
    return {
      fold: $isListItemNode(foldTarget) ? noteHasChildren(foldTarget) : false,
      delete: $canDeleteSelectedNotes(editor),
    };
  });
}
