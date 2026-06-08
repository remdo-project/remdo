import type { LexicalEditor } from 'lexical';

import type { PickerAnchor } from './types';

const PICKER_OFFSET_Y = 6;

export function resolveLinkPickerAnchor(editor: LexicalEditor): PickerAnchor | null {
  const root = editor.getRootElement();
  const container = root?.closest<HTMLElement>('.editor-container');
  if (!root || !container) {
    return null;
  }

  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const containerRect = container.getBoundingClientRect();
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

  return {
    left: targetRect.left - containerRect.left + root.scrollLeft,
    top: targetRect.bottom - containerRect.top + root.scrollTop + PICKER_OFFSET_Y,
  };
}
