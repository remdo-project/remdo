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

export function resolveDatePickerElementAnchor(editor: LexicalEditor, element: HTMLElement): PickerAnchor | null {
  const resolved = resolveContainer(editor);
  if (!resolved) {
    return null;
  }
  const { container, root } = resolved;
  const containerRect = container.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();

  return {
    left: targetRect.left - containerRect.left + root.scrollLeft,
    top: targetRect.bottom - containerRect.top + root.scrollTop + PICKER_OFFSET_Y,
  };
}
