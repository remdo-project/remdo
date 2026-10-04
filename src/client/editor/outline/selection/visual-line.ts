import { getDOMSelection } from 'lexical';
import type { LexicalEditor } from 'lexical';

export function restoreLabelFocusVisualLine(editor: LexicalEditor, atLineEnd: boolean): void {
  const selection = getDOMSelection(editor._window);
  if (!selection?.isCollapsed || !selection.focusNode) return;
  // A wrap boundary has two visual caret positions at the same DOM offset.
  // Use the crossing direction to recover that affinity without moving the point.
  const { focusNode, focusOffset } = selection;
  selection.modify('move', atLineEnd ? 'backward' : 'forward', 'character');
  selection.modify('move', atLineEnd ? 'forward' : 'backward', 'lineboundary');
  if (selection.focusNode !== focusNode || selection.focusOffset !== focusOffset) {
    selection.setBaseAndExtent(focusNode, focusOffset, focusNode, focusOffset);
  }
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
  // A collapsed caret on an empty line can report a zero-size rect; treat that
  // as unreadable so the caller's fallback decides.
  if (caretRect.height === 0 && caretRect.top === 0 && caretRect.bottom === 0) {
    return null;
  }
  const elementRect = element.getBoundingClientRect();
  // One line's worth of tolerance: the rendered line height, falling back to the
  // caret's own height. Three-quarters of a line disambiguates adjacent lines.
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || caretRect.height;
  const tolerance = lineHeight * 0.75;
  return edge === 'leading'
    ? caretRect.top - elementRect.top <= tolerance
    : elementRect.bottom - caretRect.bottom <= tolerance;
}
