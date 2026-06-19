import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  SELECT_ALL_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { useEffect, useRef } from 'react';

import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import type { NoteBodyNode } from './note-body-node';
import {
  $addNoteBody,
  $getNoteBodyFromNode,
  $removeNoteBody,
  $skipBodyForVerticalNav,
  isNoteBodyEmpty,
} from './note-body-ops';
import './note-body.css';

type VerticalDirection = 'up' | 'down';

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

export function NoteBodyPlugin() {
  const [editor] = useLexicalComposerContext();
  // Set when a plain Up/Down is pressed with the caret outside any body, so the
  // update listener can push the caret through a body it skipped into.
  const pendingSkipRef = useRef<VerticalDirection | null>(null);

  useEffect(() => {
    const $onVerticalArrow = (direction: VerticalDirection, event: KeyboardEvent | null): boolean => {
      // Plain arrows only; let modified arrows fall through to other handlers.
      if (event && (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)) {
        return false;
      }
      // Arm the skip only when the caret starts outside a body; once inside, the
      // body owns its own vertical movement (and arrows leave it freely).
      pendingSkipRef.current = $getActiveNoteBody() ? null : direction;
      return false;
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => $onVerticalArrow('up', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => $onVerticalArrow('down', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      // After the default move runs (reported as a selection change), if a
      // primed Up/Down landed the caret inside a body, push it through to the
      // content note on the far side.
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const direction = pendingSkipRef.current;
          pendingSkipRef.current = null;
          if (direction) {
            $skipBodyForVerticalNav(direction);
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      // Enter inside a body inserts a line break (the body is multi-line);
      // Shift+Enter on a note adds or focuses its body.
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }

          if ($getActiveNoteBody()) {
            selection.insertLineBreak();
            return stop(event);
          }

          if (!event?.shiftKey || !selection.isCollapsed()) {
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
