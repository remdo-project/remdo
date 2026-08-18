import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';

import { getBodyWrapper, getPreviousContentSibling } from '#client/editor/outline/list-structure';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import type { NoteBodyNode } from '#client/editor/outline/note-body-node';
import { $isNoteBodyNode } from '#client/editor/outline/note-body-node';

export function getNoteBody(note: ListItemNode): NoteBodyNode | null {
  const wrapper = getBodyWrapper(note);
  if (!wrapper) {
    return null;
  }
  const body = wrapper.getFirstChild();
  return $isNoteBodyNode(body) ? body : null;
}

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

/** A body lives in a wrapper adjacent to its note (`docs/specs/outliner/body.md`). */
export function $getNoteForBody(body: NoteBodyNode): ListItemNode | null {
  const wrapper = body.getParent();
  return $isListItemNode(wrapper) ? getPreviousContentSibling(wrapper) : null;
}

/** For selection a body belongs to its note, so the structural snap can take a
 * range with a body endpoint and snap it around whole notes. */
export function $resolveNoteForSelectionPoint(node: LexicalNode | null): ListItemNode | null {
  const body = $getNoteBodyFromNode(node);
  if (body) {
    return $getNoteForBody(body);
  }
  return resolveContentItemFromNode(node);
}

export function $getSelectionBody(selection: RangeSelection): NoteBodyNode | null {
  const anchorBody = $getNoteBodyFromNode(selection.anchor.getNode());
  return anchorBody !== null && anchorBody === $getNoteBodyFromNode(selection.focus.getNode())
    ? anchorBody
    : null;
}

/** An inline range within one body; the outline leaves it alone. */
export function $isSelectionWithinOneBody(selection: RangeSelection): boolean {
  return $getSelectionBody(selection) !== null;
}

/** Crossing a region is always a note range, even within one note
 * (content to its own body) — hence separate from the multi-note checks. */
export function $selectionCrossesRegionBoundary(selection: RangeSelection): boolean {
  return $getNoteBodyFromNode(selection.anchor.getNode()) !== $getNoteBodyFromNode(selection.focus.getNode());
}
