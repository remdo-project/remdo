import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isLineBreakNode,
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
import type { LexicalEditor, Point } from 'lexical';
import { useEffect } from 'react';

import { forEachListItemInOutline } from '#client/editor/outline/list-traversal';
import { resolveContentItemFromNode, $resolveRootContentList } from '#client/editor/outline/schema';
import { isBodyWrapper } from './note-body-node';
import type { NoteBodyNode } from './note-body-node';
import {
  $addNoteBody,
  $getNoteBodyFromNode,
  $removeNoteBody,
  $skipBodyForHorizontalNav,
  $skipBodyForVerticalNav,
  isNoteBodyEmpty,
} from './note-body-ops';
import './note-body.css';

// A body-wrapper is a leaf `ListItemNode`, so in a checklist Lexical's list DOM
// gives it checkbox semantics (`role="checkbox"`, `aria-checked`, `tabindex`)
// every time it reconciles. A body is not a checklist item, so after each update
// strip those from every body-wrapper element, keeping it out of the checkbox
// accessibility tree and hit-testing (the visual checkbox is hidden in CSS).
function stripBodyWrapperCheckboxSemantics(editor: LexicalEditor): void {
  const wrapperKeys = editor.getEditorState().read(() => {
    const rootList = $resolveRootContentList();
    if (!rootList) {
      return [];
    }
    const keys: string[] = [];
    forEachListItemInOutline(rootList, (item) => {
      if (isBodyWrapper(item)) {
        keys.push(item.getKey());
      }
    });
    return keys;
  });
  for (const key of wrapperKeys) {
    const element = editor.getElementByKey(key);
    if (!element) {
      continue;
    }
    element.removeAttribute('role');
    element.removeAttribute('aria-checked');
    element.removeAttribute('tabindex');
  }
}

function registerBodyWrapperCheckboxCleanup(editor: LexicalEditor): () => void {
  stripBodyWrapperCheckboxSemantics(editor);
  return editor.registerUpdateListener(() => {
    stripBodyWrapperCheckboxSemantics(editor);
  });
}

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
    // An element point on the body itself at offset 0 is the leading edge (e.g.
    // an empty body, or a leading blank line where the caret sits on the body).
    if (node === body) {
      return point.offset === 0;
    }
    const first = body.getFirstDescendant();
    return first !== null && node === first && point.offset === 0;
  }
  // A trailing blank line leaves the caret on the body element at its last child
  // offset rather than on a text descendant, so treat that as the trailing edge.
  if (node === body) {
    return point.offset === body.getChildrenSize();
  }
  const last = body.getLastDescendant();
  return last !== null && node === last && point.offset === last.getTextContentSize();
}

/**
 * True when `point` sits on the body's first (`leading`) or last (`trailing`)
 * visual line — no line break separates the point from that boundary. A vertical
 * move off the edge line leaves the body, so a shifted vertical arrow there must
 * be blocked, not only at the exact text edge (a single-line body has no
 * interior line, so any Shift+Down/Up would otherwise escape). Lines are split by
 * line break nodes that are direct children of the body.
 */
function $pointOnBodyEdgeLine(body: NoteBodyNode, point: Point, edge: 'leading' | 'trailing'): boolean {
  const node = point.getNode();
  if (node !== body && !body.isParentOf(node)) {
    return false;
  }
  // Line breaks are direct children of the body. Locate the point's position by
  // the index of its top-level child (the body child that is, or contains, the
  // point's node); a point directly on the body uses its own offset.
  const children = body.getChildren();
  const pointChildIndex =
    node === body ? point.offset : children.findIndex((child) => child === node || child.isParentOf(node));
  for (const [index, child] of children.entries()) {
    if (!$isLineBreakNode(child)) {
      continue;
    }
    // A line break after the point's position means it is not on the last line;
    // one before means it is not on the first line.
    if (edge === 'trailing' && index >= pointChildIndex) {
      return false;
    }
    if (edge === 'leading' && index < pointChildIndex) {
      return false;
    }
  }
  return true;
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
  // Vertical arrows move by visual line, so block from anywhere on the body's
  // edge line (a single-line body always escapes). Horizontal arrows move by
  // character, so only block at the exact text edge.
  if (direction === 'up' || direction === 'down') {
    return $pointOnBodyEdgeLine(body, selection.focus, edge);
  }
  return $pointAtBodyEdge(body, selection.focus, edge);
}

/** True when the `@` note-link picker is currently open in the document. */
function isNoteLinkPickerOpen(): boolean {
  return document.querySelector('[data-note-link-picker]') !== null;
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
      // Defer Up/Down to an open note-link picker so they navigate its options
      // rather than redirecting the caret past an adjacent body (the picker's
      // arrow handlers run at the same priority but mount after this plugin). The
      // picker ignores Left/Right, so those still run the body-skip below.
      if ((direction === 'up' || direction === 'down') && isNoteLinkPickerOpen()) {
        return false;
      }
      // Plain arrows: inside a body the caret leaves freely (native); only skip
      // when entering from outside, so an arrow never lands in a body.
      if ($getActiveNoteBody()) {
        return false;
      }
      if (direction === 'left' || direction === 'right') {
        return $skipBodyForHorizontalNav(direction) ? stop(event) : false;
      }
      return $skipBodyForVerticalNav(direction) ? stop(event) : false;
    };

    return mergeRegister(
      registerBodyWrapperCheckboxCleanup(editor),
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
