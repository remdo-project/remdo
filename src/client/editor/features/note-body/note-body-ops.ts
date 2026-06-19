import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { $createTextNode, $getSelection, $isRangeSelection } from 'lexical';
import type { LexicalNode, RangeSelection } from 'lexical';

import { getBodyWrapper, getPreviousContentSibling } from '#client/editor/outline/list-structure';
import { $isNoteFolded } from '#client/editor/runtime/fold-state';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { $selectItemEdge } from '#client/editor/outline/selection/caret';
import {
  getFirstDescendantListItem,
  getLastDescendantListItem,
  getNestedList,
  getNextContentSibling,
  getParentContentItem,
} from '#client/editor/outline/selection/tree';
import type { NoteBodyNode } from './note-body-node';
import { $createBodyWrapper, $isNoteBodyNode } from './note-body-node';

/** The note body element attached to a note, or null if the note has none. */
export function getNoteBody(note: ListItemNode): NoteBodyNode | null {
  const wrapper = getBodyWrapper(note);
  if (!wrapper) {
    return null;
  }
  const body = wrapper.getFirstChild();
  return $isNoteBodyNode(body) ? body : null;
}

/** Walk up from any node to the enclosing note body, or null. */
export function $getNoteBodyFromNode(node: LexicalNode | null): NoteBodyNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isNoteBodyNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

/**
 * The content note directly below `note` in document order, ignoring any body:
 * its first child when expanded with children, otherwise the next content
 * sibling, climbing to ancestors when `note` is a last child. Null at the end.
 */
function $noteBelow(note: ListItemNode): ListItemNode | null {
  if (!$isNoteFolded(note)) {
    const firstChild = getFirstDescendantListItem(getNestedList(note));
    if (firstChild) {
      return firstChild;
    }
  }
  let current: ListItemNode | null = note;
  while (current) {
    const next = getNextContentSibling(current);
    if (next) {
      return next;
    }
    current = getParentContentItem(current);
  }
  return null;
}

/**
 * The content note directly above `note` in document order, ignoring any body:
 * the previous content sibling's deepest last descendant (its visually-last
 * line), otherwise the parent. Null at the top.
 */
function $noteAbove(note: ListItemNode): ListItemNode | null {
  const previous = getPreviousContentSibling(note);
  if (previous) {
    return $isNoteFolded(previous) ? previous : getLastDescendantListItem(getNestedList(previous)) ?? previous;
  }
  return getParentContentItem(note);
}

/**
 * When a plain vertical arrow from a content note would move into an adjacent
 * body, redirect the caret past the body so navigation never stops in one
 * (a content note is a single line, so the move always lands in the body).
 * `down` from a note with a body lands on the note after the body; `up` from the
 * note directly after a body lands on the body's owner note. Returns true when it
 * redirected, false to fall through to native movement.
 */
export function $skipBodyForVerticalNav(direction: 'up' | 'down'): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const note = resolveContentItemFromNode(selection.anchor.getNode());
  if (!note) {
    return false;
  }

  if (direction === 'down') {
    if (!getBodyWrapper(note)) {
      return false;
    }
    // The body is transparent: land where Down would go if it did not exist —
    // the note's first child (expanded) or the next note in document order, and
    // when nothing is below, the note's own text end (matching native last-line
    // behavior). Either way, consume the event so native nav cannot enter body.
    const target = $noteBelow(note);
    $selectItemEdge(target ?? note, target ? 'start' : 'end');
    return true;
  }

  // up: the note above in document order is the visual line above. If it has a
  // body, native Up would land in that body — redirect to the note's end so the
  // body stays transparent.
  const above = $noteAbove(note);
  if (!above || !getBodyWrapper(above)) {
    return false;
  }
  $selectItemEdge(above, 'end');
  return true;
}

/** True when either end of the selection sits inside a note body. */
export function $isSelectionInNoteBody(selection: RangeSelection): boolean {
  return (
    $getNoteBodyFromNode(selection.anchor.getNode()) !== null ||
    $getNoteBodyFromNode(selection.focus.getNode()) !== null
  );
}

/**
 * Add a body to the note (or return its existing one), and place the caret at
 * the start of the body. The body-wrapper is inserted immediately after the
 * note's content item, before any children-wrapper.
 */
export function $addNoteBody(note: ListItemNode): NoteBodyNode {
  const existing = getNoteBody(note);
  if (existing) {
    existing.selectStart();
    return existing;
  }

  const wrapper = $createBodyWrapper();
  note.insertAfter(wrapper);
  const body = wrapper.getFirstChild();
  if (!$isNoteBodyNode(body)) {
    throw new Error('Expected freshly created body-wrapper to hold a note body.');
  }
  // Anchor the caret on an empty text node inside the body (mirroring how an
  // empty note holds its caret), so typed text lands in the body rather than
  // bubbling up to the list-item parent.
  const anchor = $createTextNode('');
  body.append(anchor);
  anchor.select(0, 0);
  return body;
}

/** Remove a note body and place the caret back at the end of its note. */
export function $removeNoteBody(body: NoteBodyNode): void {
  const wrapper = body.getParent();
  const note = wrapper && $isListItemNode(wrapper) ? wrapper.getPreviousSibling() : null;
  if (wrapper) {
    wrapper.remove();
  }
  if ($isListItemNode(note)) {
    note.selectEnd();
  }
}

/** True when the body has no text content (after trimming whitespace). */
export function isNoteBodyEmpty(body: NoteBodyNode): boolean {
  return body.getTextContent().trim().length === 0;
}
