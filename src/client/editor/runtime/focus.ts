import type { LexicalEditor } from 'lexical';

// Focus the contenteditable root directly. `editor.focus()` alone does not restore focus when a
// popup that held DOM focus has just unmounted, so the root element is focused first.
export function focusEditorRoot(editor: LexicalEditor): void {
  editor.getRootElement()?.focus({ preventScroll: true });
}

// Restore focus after a focus-trapping popup commits and unmounts. Deferred to a microtask so the
// popup has finished unmounting before focus moves, and followed by `editor.focus()` to re-apply
// the selection the commit placed (the commit itself runs under SKIP_DOM_SELECTION_TAG).
export function restoreEditorFocus(editor: LexicalEditor): void {
  queueMicrotask(() => {
    focusEditorRoot(editor);
    editor.focus();
  });
}
