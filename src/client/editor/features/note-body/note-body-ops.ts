import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { $createTextNode } from 'lexical';
import type { LexicalNode, RangeSelection } from 'lexical';

import { getBodyWrapper } from '#client/editor/outline/list-structure';
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
