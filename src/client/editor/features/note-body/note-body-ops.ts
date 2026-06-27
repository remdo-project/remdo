import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { $createTextNode, $getSelection, $isRangeSelection, getDOMSelection } from 'lexical';
import type { LexicalEditor, LexicalNode, RangeSelection } from 'lexical';

import { getBodyWrapper, getPreviousContentSibling } from '#client/editor/outline/list-structure';
import { $isNoteFolded } from '#client/editor/runtime/fold-state';
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
import type { NoteBodyNode } from './note-body-node';
import { $createBodyWrapper, $isNoteBodyNode, isBodyWrapper } from './note-body-node';

/** The note body element attached to a note, or null if the note has none. */
export function getNoteBody(note: ListItemNode): NoteBodyNode | null {
  const wrapper = getBodyWrapper(note);
  if (!wrapper) {
    return null;
  }
  const body = wrapper.getFirstChild();
  return $isNoteBodyNode(body) ? body : null;
}

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
 * True when the collapsed caret sits on `element`'s first (`leading`) or last
 * (`trailing`) *visual* line, measured from the live DOM so soft-wrapped lines
 * count. Compares the caret's client rect against the element's box: leading when
 * the caret top is within ~one line of the element top, trailing when the caret
 * bottom is within ~one line of the element bottom. Returns null when the
 * geometry can't be read (no rendered caret), so callers fall back.
 */
export function $isCaretOnElementEdgeVisualLine(
  editor: LexicalEditor,
  element: HTMLElement,
  edge: 'leading' | 'trailing'
): boolean | null {
  const domSelection = getDOMSelection(editor._window);
  if (!domSelection || domSelection.rangeCount === 0 || domSelection.focusNode === null) {
    return null;
  }
  // Measure the focus (moving) caret, not the whole selection: a non-collapsed
  // selection (e.g. an in-progress Shift+Arrow extension) would otherwise report
  // the union of its visual lines, putting both edges at the element's bounds.
  // Create the range in the editor's window document to stay window-relative
  // (consistent with getDOMSelection(editor._window) above).
  const focusRange = (editor._window ?? window).document.createRange();
  focusRange.setStart(domSelection.focusNode, domSelection.focusOffset);
  const caretRect = focusRange.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  // A collapsed caret on an empty line can report a zero-size rect; treat that
  // as unreadable so the caller's fallback decides.
  if (caretRect.height === 0 && caretRect.top === 0 && caretRect.bottom === 0) {
    return null;
  }
  // One line's worth of tolerance: the rendered line height, falling back to the
  // caret's own height. Three-quarters of a line disambiguates adjacent lines.
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || caretRect.height || 0;
  const tolerance = lineHeight * 0.75;
  return edge === 'leading'
    ? caretRect.top - elementRect.top <= tolerance
    : elementRect.bottom - caretRect.bottom <= tolerance;
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
 * When a plain vertical arrow from a content note would move into an adjacent
 * body, redirect the caret past the body so navigation never stops in one. The
 * note's label may soft-wrap, so only redirect from the note's edge visual line
 * (toward the arrow); from an interior wrapped line, native movement handles the
 * within-note step. `down` from a note with a body lands on the note after the
 * body; `up` from the note directly after a body lands on the body's owner note.
 * Returns true when it redirected, false to fall through to native movement.
 */
export function $skipBodyForVerticalNav(
  editor: LexicalEditor,
  direction: 'up' | 'down',
  boundaryRoot: ListItemNode | null
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const note = resolveContentItemFromNode(selection.anchor.getNode());
  if (!note) {
    return false;
  }

  if (direction === 'down') {
    if (!getBodyWrapper(note) || !$caretOnNoteEdgeLine(editor, note, 'trailing')) {
      return false;
    }
    // The body is transparent: land where Down would go if it did not exist —
    // the note's first child (expanded) or the next note in document order, and
    // when nothing is below, the note's own text end (matching native last-line
    // behavior). A target outside the zoom boundary is hidden, so treat it as
    // nothing-below. Either way, consume the event so native nav cannot enter body.
    const target = $noteBelowWithinBoundary(note, boundaryRoot);
    $selectItemEdge(target ?? note, target ? 'start' : 'end');
    return true;
  }

  // up: the note above in document order is the visual line above. If it has a
  // body, native Up would land in that body — redirect to the note's end so the
  // body stays transparent. A note above the zoom boundary is hidden, so leave
  // native nav to handle the boundary. (Structural checks first, so a plain Up in
  // a bodyless note doesn't pay the geometry read below.)
  const above = $noteAbove(note);
  if (!above || !isWithinBoundary(above, boundaryRoot) || !getBodyWrapper(above)) {
    return false;
  }
  // Only redirect from the note's first visual line; an interior wrapped line
  // moves natively.
  if (!$caretOnNoteEdgeLine(editor, note, 'leading')) {
    return false;
  }
  $selectItemEdge(above, 'end');
  return true;
}

// The note below `note` (ignoring its body) that is still inside the zoom
// boundary, or null when the next note is hidden by the zoom or there is none.
function $noteBelowWithinBoundary(note: ListItemNode, boundaryRoot: ListItemNode | null): ListItemNode | null {
  const target = $noteBelow(note);
  return target && isWithinBoundary(target, boundaryRoot) ? target : null;
}

/**
 * When a plain horizontal arrow would step the caret out of a content note into
 * an adjacent body, redirect past the body so arrows never enter one from
 * outside. `right` at a note's end skips to the next note; `left` at a note's
 * start (when the note follows a body) skips to that body's owner note. Only
 * acts at the note boundary; otherwise the arrow moves within the note text.
 */
export function $skipBodyForHorizontalNav(direction: 'left' | 'right', boundaryRoot: ListItemNode | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const note = resolveContentItemFromNode(selection.anchor.getNode());
  if (!note) {
    return false;
  }

  if (direction === 'right') {
    if (!getBodyWrapper(note) || !isPointAtBoundary(selection.anchor, note, 'end')) {
      return false;
    }
    // Body is transparent: a note's last child or its next note in document
    // order. No note after the body (or one hidden by the zoom boundary) → no-op
    // (consume, do not enter the body and do not escape the zoom).
    const target = $noteBelowWithinBoundary(note, boundaryRoot);
    if (target) {
      $selectItemEdge(target, 'start');
    }
    return true;
  }

  // left: only at the note's start, and only when a body sits directly before it.
  if (!isPointAtBoundary(selection.anchor, note, 'start')) {
    return false;
  }
  const above = $noteAbove(note);
  if (!above || !isWithinBoundary(above, boundaryRoot) || !getBodyWrapper(above)) {
    return false;
  }
  $selectItemEdge(above, 'end');
  return true;
}

/**
 * The content note that owns `body` — the content sibling before the body's
 * wrapper list item — or null. (The body lives in a body-wrapper adjacent to its
 * note; see `docs/outliner/body.md`.)
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
 * structural selection instead (see `docs/outliner/body.md`).
 */
export function $isSelectionWithinOneBody(selection: RangeSelection): boolean {
  return $getSelectionBody(selection) !== null;
}

/**
 * True when the selection's two ends sit in different regions — a note's content
 * and a body, or two different bodies. Crossing a region boundary is always a
 * structural selection, even within a single note (content ↔ its own body),
 * which is why this is distinct from the multi-note checks. A selection wholly
 * within one region (one content note, or one body) returns false.
 */
export function $selectionCrossesRegionBoundary(selection: RangeSelection): boolean {
  return $getNoteBodyFromNode(selection.anchor.getNode()) !== $getNoteBodyFromNode(selection.focus.getNode());
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
  const note = $getNoteForBody(body);
  body.getParent()?.remove();
  note?.selectEnd();
}

/** True when the body has no text content (after trimming whitespace). */
export function isNoteBodyEmpty(body: NoteBodyNode): boolean {
  return body.getTextContent().trim().length === 0;
}
