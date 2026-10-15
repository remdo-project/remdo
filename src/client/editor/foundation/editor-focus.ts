export function hasNativeEditorSelection(root: HTMLElement | null): boolean {
  if (!root) return false;
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  return doc.hasFocus() && root.contains(doc.activeElement) && root.contains(selection?.anchorNode ?? null)
    && root.contains(selection?.focusNode ?? null);
}
