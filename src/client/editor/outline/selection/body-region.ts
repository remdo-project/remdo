import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';

import { getBodyWrapper, getPreviousContentSibling } from '#client/editor/outline/list-structure';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import type { NoteBodyNode } from '#client/editor/outline/note-body-node';
import { $isNoteBodyNode } from '#client/editor/outline/note-body-node';

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
 * The content note that owns `body` — the content sibling before the body's
 * wrapper list item — or null. (The body lives in a body-wrapper adjacent to its
 * note; see `docs/specs/outliner/body.md`.)
 */
export function $getNoteForBody(body: NoteBodyNode): ListItemNode | null {
  const wrapper = body.getParent();
  return $isListItemNode(wrapper) ? getPreviousContentSibling(wrapper) : null;
}

/**
 * Resolve a selection point's node to the content note of its region: a node
 * inside a body resolves to that body's owner note (for selection the body is
 * part of its note), otherwise to the content note the node sits in. Used by the
 * structural snap so a range with a body endpoint snaps around whole notes.
 */
export function $resolveNoteForSelectionPoint(node: LexicalNode | null): ListItemNode | null {
  const body = $getNoteBodyFromNode(node);
  if (body) {
    return $getNoteForBody(body);
  }
  return resolveContentItemFromNode(node);
}

/**
 * The single note body the whole selection sits inside, or null when it does not
 * (one end outside a body, or ends in two different bodies). A collapsed caret in
 * a body returns that body.
 */
export function $getSelectionBody(selection: RangeSelection): NoteBodyNode | null {
  const anchorBody = $getNoteBodyFromNode(selection.anchor.getNode());
  return anchorBody !== null && anchorBody === $getNoteBodyFromNode(selection.focus.getNode())
    ? anchorBody
    : null;
}

/**
 * True when the whole selection sits inside a single note body — an inline range
 * within one body, which the outline leaves alone. A selection with only one end
 * in a body, or ends in two different bodies, crosses a region boundary and is a
 * note range instead (see `docs/specs/outliner/body.md`).
 */
export function $isSelectionWithinOneBody(selection: RangeSelection): boolean {
  return $getSelectionBody(selection) !== null;
}

/**
 * True when the selection's two ends sit in different regions — a note's content
 * and a body, or two different bodies. Crossing a region boundary is always a
 * note range, even within a single note (content ↔ its own body),
 * which is why this is distinct from the multi-note checks. A selection wholly
 * within one region (one content note, or one body) returns false.
 */
export function $selectionCrossesRegionBoundary(selection: RangeSelection): boolean {
  return $getNoteBodyFromNode(selection.anchor.getNode()) !== $getNoteBodyFromNode(selection.focus.getNode());
}
