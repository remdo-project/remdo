import type { LexicalEditor } from 'lexical';

import type { PickerAnchor } from './types';

const PICKER_OFFSET_Y = 6;

function resolveContainer(editor: LexicalEditor): { container: HTMLElement; root: HTMLElement } | null {
  const root = editor.getRootElement();
  const container = root?.closest<HTMLElement>('.editor-container');
  if (!root || !container) {
    return null;
  }
  return { container, root };
}

function toContainerAnchor(container: HTMLElement, root: HTMLElement, targetRect: DOMRect): PickerAnchor {
  const containerRect = container.getBoundingClientRect();
  return {
    left: targetRect.left - containerRect.left + root.scrollLeft,
    top: targetRect.bottom - containerRect.top + root.scrollTop + PICKER_OFFSET_Y,
  };
}

// Anchor the picker just below the caret. Used by typed-trigger sessions.
export function resolveCaretPickerAnchor(editor: LexicalEditor): PickerAnchor | null {
  const resolved = resolveContainer(editor);
  if (!resolved) {
    return null;
  }
  const { container, root } = resolved;

  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const fallbackAnchor: PickerAnchor = {
    left: root.scrollLeft,
    top: root.scrollTop + PICKER_OFFSET_Y,
  };

  const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
  const firstRect = typeof range.getClientRects === 'function' ? range.getClientRects().item(0) : null;
  const targetRect = rect && (rect.width > 0 || rect.height > 0) ? rect : firstRect;
  if (!targetRect) {
    return fallbackAnchor;
  }

  return toContainerAnchor(container, root, targetRect);
}

// Anchor the picker just below a specific element. Used by the date edit-mode
// popover, which opens from a committed token rather than a caret session.
export function resolveElementPickerAnchor(editor: LexicalEditor, element: HTMLElement): PickerAnchor | null {
  const resolved = resolveContainer(editor);
  if (!resolved) {
    return null;
  }
  return toContainerAnchor(resolved.container, resolved.root, element.getBoundingClientRect());
}
