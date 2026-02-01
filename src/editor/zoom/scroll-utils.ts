import type { LexicalEditor } from 'lexical';

import { scrollIntoViewIfNeeded } from '@/editor/lexical/unexported';

const findScrollContainer = (element: HTMLElement | null): HTMLElement | null => {
  let current: HTMLElement | null = element;
  while (current) {
    const style = globalThis.getComputedStyle(current);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const isElementInView = (element: HTMLElement, container: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return rect.top >= containerRect.top - 1 && rect.bottom <= containerRect.bottom + 1;
};

export function scrollZoomTargetIntoView(editor: LexicalEditor, targetElement: HTMLElement): boolean {
  const rootElement = editor.getRootElement();
  if (!rootElement) {
    return false;
  }

  const rect = targetElement.getBoundingClientRect();
  if (rect.height <= 0 && rect.width <= 0) {
    return false;
  }

  const scrollRoot = findScrollContainer(targetElement) ?? rootElement;
  scrollIntoViewIfNeeded(editor, rect, scrollRoot);
  if (!isElementInView(targetElement, scrollRoot)) {
    targetElement.scrollIntoView({ block: 'nearest' });
  }

  return true;
}
