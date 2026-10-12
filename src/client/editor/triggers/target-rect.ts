export function hasArea(rect: DOMRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

// Caret-anchored popups have no trigger element. React Aria's getTargetRect
// overrides the trigger box with this live selection rect (viewport coords).
// A caret in an empty element has no rect, and a selection outside the editor
// (inside the popup itself) is not the caret.
export function resolveCaretTargetRect(root: HTMLElement | null): DOMRect | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0 || !root?.contains(selection.anchorNode)) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
  if (rect && hasArea(rect)) {
    return rect;
  }
  const lineRect = typeof range.getClientRects === 'function' ? range.getClientRects().item(0) : null;
  return lineRect && hasArea(lineRect) ? lineRect : null;
}

// Where the first line of a note row's text begins: the caret position of an
// empty note and the row-level anchor when the row has no caret of its own.
export function resolveNoteStartRect(row: HTMLElement): DOMRect {
  const box = row.getBoundingClientRect();
  const style = globalThis.getComputedStyle(row);
  const lineHeight = Number.parseFloat(style.lineHeight) || box.height;
  return new DOMRect(
    box.left + (Number.parseFloat(style.paddingLeft) || 0),
    box.top + (Number.parseFloat(style.paddingTop) || 0),
    0,
    Math.min(lineHeight, box.height),
  );
}
