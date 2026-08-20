// Caret-anchored popups have no trigger element. React Aria's getTargetRect
// overrides the trigger box with this live selection rect (viewport coords).
export function resolveCaretTargetRect(): DOMRect | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
  if (rect && (rect.width > 0 || rect.height > 0)) {
    return rect;
  }
  return typeof range.getClientRects === 'function' ? range.getClientRects().item(0) : null;
}
