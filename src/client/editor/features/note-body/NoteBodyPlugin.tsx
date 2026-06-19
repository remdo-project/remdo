import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  SELECT_ALL_COMMAND,
} from 'lexical';
import type { Point } from 'lexical';
import { useEffect } from 'react';

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

function stop(event: KeyboardEvent | null): true {
  event?.preventDefault();
  event?.stopPropagation();
  return true;
}

/**
 * True when `point` sits at the body's leading or trailing edge — the boundaries
 * where a delete or selection extension would otherwise reach into the
 * surrounding notes.
 */
function $pointAtBodyEdge(body: NoteBodyNode, point: Point, edge: 'leading' | 'trailing'): boolean {
  const node = point.getNode();
  if (edge === 'leading') {
    const first = body.getFirstDescendant();
    if (first === null) {
      return node === body && point.offset === 0;
    }
    return node === first && point.offset === 0;
  }
  const last = body.getLastDescendant();
  if (last === null) {
    return node === body;
  }
  return node === last && point.offset === last.getTextContentSize();
}

/** True when a collapsed caret sits at the body's leading/trailing edge. */
function $isCaretAtBodyEdge(body: NoteBodyNode, direction: 'backward' | 'forward'): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  return $pointAtBodyEdge(body, selection.anchor, direction === 'backward' ? 'leading' : 'trailing');
}

type ArrowDirection = 'up' | 'down' | 'left' | 'right';

/**
 * A body is a self-contained selection world, so a Shift+Arrow must never extend
 * the selection out of it. Block a shifted arrow when the focus is inside a body
 * and already at the boundary toward the arrow's direction.
 */
function $shouldBlockBodyShiftArrow(direction: ArrowDirection): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }
  const body = $getNoteBodyFromNode(selection.focus.getNode());
  if (!body) {
    return false;
  }
  const edge = direction === 'left' || direction === 'up' ? 'leading' : 'trailing';
  return $pointAtBodyEdge(body, selection.focus, edge);
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

  useEffect(() => {
    const $onArrow = (direction: ArrowDirection, event: KeyboardEvent | null): boolean => {
      // Shift+Arrow: a body owns its selection world, so block extension out of
      // it at the boundary (other modifiers fall through).
      if (event?.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
        return $shouldBlockBodyShiftArrow(direction) ? stop(event) : false;
      }
      // Other modified arrows are handled elsewhere.
      if (event && (event.altKey || event.metaKey || event.ctrlKey)) {
        return false;
      }
      // Plain vertical arrows: inside a body the caret leaves freely (native);
      // only skip when entering from outside (a content note is one line, so a
      // vertical arrow toward an adjacent body lands in it — redirect past it).
      if (direction === 'left' || direction === 'right' || $getActiveNoteBody()) {
        return false;
      }
      return $skipBodyForVerticalNav(direction) ? stop(event) : false;
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => $onArrow('up', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => $onArrow('down', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => $onArrow('left', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => $onArrow('right', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      // Enter inside a body inserts a line break (the body is multi-line);
      // Shift+Enter on a note adds or focuses its body. Registered at HIGH (not
      // CRITICAL) so an open typeahead — e.g. the `@` link picker — confirms its
      // option on Enter first, matching how note insertion defers to the picker.
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
        COMMAND_PRIORITY_HIGH
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
        (event: KeyboardEvent | null) => $handleBodyDelete('backward', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event: KeyboardEvent | null) => $handleBodyDelete('forward', event),
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor]);

  return null;
}

function $handleBodyDelete(direction: 'backward' | 'forward', event: KeyboardEvent | null): boolean {
  const body = $getActiveNoteBody();
  if (!body) {
    return false;
  }
  if (isNoteBodyEmpty(body)) {
    $removeNoteBody(body);
    return stop(event);
  }

  const selection = $getSelection();
  if ($isRangeSelection(selection) && !selection.isCollapsed()) {
    // Select-all (or any full-text range) + delete: if the whole body text is
    // selected, removing it empties the body; drop the body in one step.
    const selectedLength = selection.getTextContent().length;
    if (selectedLength >= body.getTextContentSize() && selectedLength > 0) {
      $removeNoteBody(body);
      return stop(event);
    }
    return false;
  }

  // Collapsed caret at a body boundary is a no-op: a body never merges into the
  // surrounding notes (Backspace at the start / Delete at the end). Otherwise let
  // the default delete edit the body text in place.
  return $isCaretAtBodyEdge(body, direction) ? stop(event) : false;
}
