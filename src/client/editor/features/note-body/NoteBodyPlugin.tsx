import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  SELECT_ALL_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import type { NoteBodyNode } from './note-body-node';
import { $addNoteBody, $getNoteBodyFromNode, $removeNoteBody, isNoteBodyEmpty } from './note-body-ops';
import './note-body.css';

type ArrowDirection = 'up' | 'down' | 'left' | 'right';

function stop(event: KeyboardEvent | null): true {
  event?.preventDefault();
  event?.stopPropagation();
  return true;
}

/** The note body containing the current caret/selection, or null. */
function $getActiveNoteBody(): NoteBodyNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }
  const anchorBody = $getNoteBodyFromNode(selection.anchor.getNode());
  const focusBody = $getNoteBodyFromNode(selection.focus.getNode());
  return anchorBody && anchorBody === focusBody ? anchorBody : null;
}

/**
 * True when a plain arrow press would move the caret out of the body in the
 * given direction. Up/Down always escape (a body is one logical line for
 * vertical nav); Left/Right escape only at the body's text boundaries.
 */
function $arrowWouldLeaveBody(body: NoteBodyNode, direction: ArrowDirection): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  if (direction === 'up' || direction === 'down') {
    return true;
  }

  const size = body.getTextContentSize();
  const offset = $bodyCaretOffset(body);
  if (offset === null) {
    return false;
  }
  return direction === 'left' ? offset === 0 : offset === size;
}

/** Caret offset within the body's flattened text, or null if not collapsed. */
function $bodyCaretOffset(body: NoteBodyNode): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }
  const anchor = selection.anchor;
  const node = anchor.getNode();
  let offset = anchor.type === 'text' ? anchor.offset : 0;
  // Sum the text length of everything before the anchor node within the body.
  let cursor = node.getPreviousSibling();
  while (cursor && $getNoteBodyFromNode(cursor) === body) {
    offset += cursor.getTextContentSize();
    cursor = cursor.getPreviousSibling();
  }
  return offset;
}

export function NoteBodyPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $handleArrow = (direction: ArrowDirection, event: KeyboardEvent | null): boolean => {
      // Plain arrows only; modified arrows (shift/alt/meta/ctrl) are handled
      // elsewhere or fall through.
      if (event && (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)) {
        return false;
      }
      const body = $getActiveNoteBody();
      if (!body) {
        return false;
      }
      // Trap the caret: block any arrow that would leave the body.
      return $arrowWouldLeaveBody(body, direction) ? stop(event) : false;
    };

    return mergeRegister(
      // Shift+Enter on a note: add or focus its body. Registered with a plain
      // Enter command guarded on shiftKey so it pre-empts default insertion.
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || !event.shiftKey) {
            return false;
          }
          // Already inside a body: Shift+Enter is a no-op here for now (the body
          // is single-block; let the editor ignore it rather than split notes).
          if ($getActiveNoteBody()) {
            return stop(event);
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
          if (!contentItem) {
            return false;
          }
          $addNoteBody(contentItem);
          return stop(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      // Cmd/Ctrl+A inside a body selects the body's text only; never the ladder.
      editor.registerCommand(
        SELECT_ALL_COMMAND,
        (event: KeyboardEvent | null) => {
          const body = $getActiveNoteBody();
          if (!body) {
            return false;
          }
          body.select(0, body.getChildrenSize());
          return stop(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => $handleArrow('up', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => $handleArrow('down', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => $handleArrow('left', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => $handleArrow('right', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      // Deletion: removing all text from a body deletes the body. Backspace or
      // Delete on an already-empty body removes it and returns to the note.
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event: KeyboardEvent | null) => $handleBodyDelete(event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event: KeyboardEvent | null) => $handleBodyDelete(event),
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor]);

  return null;
}

function $handleBodyDelete(event: KeyboardEvent | null): boolean {
  const body = $getActiveNoteBody();
  if (!body) {
    return false;
  }
  if (isNoteBodyEmpty(body)) {
    $removeNoteBody(body);
    return stop(event);
  }
  // Non-empty: let the default delete edit the text. The body is removed only
  // once it becomes empty (next press), or via select-all + delete.
  const selection = $getSelection();
  if ($isRangeSelection(selection) && !selection.isCollapsed()) {
    // Select-all (or any full-text range) + delete: if the whole body text is
    // selected, removing it empties the body; drop the body in one step.
    const selectedLength = selection.getTextContent().length;
    if (selectedLength >= body.getTextContentSize() && selectedLength > 0) {
      $removeNoteBody(body);
      return stop(event);
    }
  }
  return false;
}
