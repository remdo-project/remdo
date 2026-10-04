import type { ListItemNode } from '@lexical/list';
import { $createTextNode, $getSelection, $isRangeSelection } from 'lexical';
import type { LexicalEditor, LexicalNode } from 'lexical';
import { $isCaretOnElementEdgeVisualLine } from '#client/editor/outline/selection/visual-line';

import { getBodyWrapper, getPreviousContentSibling } from '#client/editor/outline/list-structure';
import { $isNoteFolded } from '#client/editor/outline/fold-state';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { $selectItemEdge, isPointAtBoundary } from '#client/editor/outline/selection/caret';
import {
  getFirstDescendantListItem,
  getLastDescendantListItem,
  getNestedList,
  getNextContentSibling,
  getParentContentItem,
  isWithinBoundary,
} from '#client/editor/outline/selection/tree';
import type { NoteBodyNode } from '#client/editor/outline/note-body-node';
import { $createBodyWrapper, $isNoteBodyNode, isBodyWrapper } from '#client/editor/outline/note-body-node';
import { getNoteBody, $getNoteForBody } from '#client/editor/outline/selection/body-region';

/**
 * Reconcile concurrently-created body-wrappers so a note keeps at most one body
 * (the documented invariant). Under collaboration, two `Shift+Enter`s on the
 * same body-less note can each insert a body-wrapper before either syncs; on
 * merge the note ends up with several. Keep the first body and fold every later
 * body-wrapper's content into it, dropping the now-empty wrappers. A node
 * transform runs this until the tree is stable.
 */
export function $reconcileNoteBodyWrappers(note: ListItemNode): void {
  // Collect every body-wrapper in the note's adjacency run (its siblings up to
  // the next content note — body-wrapper(s) and an optional children-wrapper, in
  // any order). A concurrent collab merge can land a body-wrapper after the
  // children-wrapper (`note, children-wrapper, body-wrapper`), where the
  // immediate-sibling getBodyWrapper would miss it and leave the body orphaned.
  // The run ends at the next content note (a body-wrapper / children-wrapper are
  // not content items); collect every body-wrapper before it.
  const runEnd = getNextContentSibling(note);
  const bodyWrappers: ListItemNode[] = [];
  let sibling: LexicalNode | null = note.getNextSibling();
  while (sibling !== null && sibling !== runEnd) {
    const after: LexicalNode | null = sibling.getNextSibling();
    if (isBodyWrapper(sibling)) {
      bodyWrappers.push(sibling);
    }
    sibling = after;
  }

  const [firstWrapper, ...duplicateWrappers] = bodyWrappers;
  if (!firstWrapper) {
    return;
  }
  const firstBody = firstWrapper.getFirstChild();
  if (!$isNoteBodyNode(firstBody)) {
    return;
  }
  // The body-wrapper belongs immediately after the note (before any
  // children-wrapper). Move it there if a merge stranded it elsewhere.
  if (note.getNextSibling() !== firstWrapper) {
    note.insertAfter(firstWrapper);
  }
  // Fold every other body-wrapper's content into the first and drop it, so the
  // note keeps at most one body.
  for (const duplicate of duplicateWrappers) {
    const duplicateBody = duplicate.getFirstChild();
    if ($isNoteBodyNode(duplicateBody)) {
      firstBody.append(...duplicateBody.getChildren());
    }
    duplicate.remove();
  }
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

// Is the caret on the visual edge line of `note`'s content toward `edge`? A
// note's label can soft-wrap over several visual lines, so a vertical arrow only
// leaves the note (into an adjacent body) from the edge line; from an interior
// wrapped line it must move within the note. Unknown geometry (null) is treated
// as "on the edge" so the body stays transparent in the common single-line case.
function $caretOnNoteEdgeLine(
  editor: LexicalEditor,
  note: ListItemNode,
  edge: 'leading' | 'trailing'
): boolean {
  const element = editor.getElementByKey(note.getKey());
  if (!element) {
    return true;
  }
  return $isCaretOnElementEdgeVisualLine(editor, element, edge) ?? true;
}

/**
 * Arrows skip bodies when entering from outside. Vertical movement leaves from
 * the rendered edge line; horizontal movement leaves only at the text edge.
 * At the final note, vertical movement lands at its end and horizontal movement
 * is a no-op. Folding and zoom determine the visible destination.
 */
export function $skipBodyForNav(
  editor: LexicalEditor,
  direction: 'up' | 'down' | 'left' | 'right',
  boundaryRoot: ListItemNode | null
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const note = resolveContentItemFromNode(selection.anchor.getNode());
  if (!note) return false;
  const forward = direction === 'down' || direction === 'right';
  const vertical = direction === 'up' || direction === 'down';
  const above = forward ? null : $noteAbove(note);
  if (forward) {
    if (!getBodyWrapper(note)) return false;
  } else if (!above || !isWithinBoundary(above, boundaryRoot) || !getBodyWrapper(above)) {
    return false;
  }
  const onEdge = vertical
    ? $caretOnNoteEdgeLine(editor, note, forward ? 'trailing' : 'leading')
    : isPointAtBoundary(selection.anchor, note, forward ? 'end' : 'start');
  if (!onEdge) return false;
  let target = above;
  if (forward) {
    const below = $noteBelow(note);
    target = below && isWithinBoundary(below, boundaryRoot) ? below : null;
  }
  if (target) $selectItemEdge(target, forward ? 'start' : 'end');
  else if (vertical) $selectItemEdge(note, 'end');
  return true;
}

/**
 * Add a body to the note (or return its existing one), and place the caret at
 * the start of the body. The body-wrapper is inserted immediately after the
 * note's content item, before any children-wrapper.
 */
export function $addNoteBody(note: ListItemNode): NoteBodyNode {
  const existing = getNoteBody(note);
  if (existing) {
    // Land at the end: the gesture means "add to this note's body", so typing
    // appends. Landing at the start would fuse the new text onto the existing
    // text with no separator.
    existing.selectEnd();
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
  const note = $getNoteForBody(body);
  body.getParent()?.remove();
  note?.selectEnd();
}

/** True when the body has no text content (after trimming whitespace). */
export function isNoteBodyEmpty(body: NoteBodyNode): boolean {
  return body.getTextContent().trim().length === 0;
}
