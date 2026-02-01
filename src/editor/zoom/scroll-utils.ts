import type { LexicalEditor } from 'lexical';

import { scrollIntoViewIfNeeded } from '@/editor/lexical/unexported';

const findScrollContainer = (element: HTMLElement | null): HTMLElement | null => {
  let current: HTMLElement | null = element;
  while (current) {
    const style = globalThis.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const getSelectionRect = (targetElement: HTMLElement): DOMRect | null => {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const { startContainer, endContainer } = range;
  if (!targetElement.contains(startContainer) || !targetElement.contains(endContainer)) {
    return null;
  }

  const rects = range.getClientRects();
  if (rects.length > 0) {
    return rects[0] ?? null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.height > 0 || rect.width > 0) {
    return rect;
  }

  return null;
};

const isRectInView = (rect: DOMRect, container: HTMLElement): boolean => {
  const containerRect = container.getBoundingClientRect();
  return rect.top >= containerRect.top - 1 && rect.bottom <= containerRect.bottom + 1;
};

const scrollRectIntoView = (container: HTMLElement, rect: DOMRect) => {
  const containerRect = container.getBoundingClientRect();
  let diff = 0;
  if (rect.top < containerRect.top) {
    diff = rect.top - containerRect.top;
  } else if (rect.bottom > containerRect.bottom) {
    diff = rect.bottom - containerRect.bottom;
  }
  if (diff !== 0) {
    container.scrollTop += diff;
  }
};

export function scrollZoomTargetIntoView(editor: LexicalEditor, targetElement: HTMLElement): boolean {
  const rootElement = editor.getRootElement();
  if (!rootElement) {
    return false;
  }

  const initialSelectionRect = getSelectionRect(targetElement);
  const rect = initialSelectionRect ?? targetElement.getBoundingClientRect();
  if (rect.height <= 0 && rect.width <= 0) {
    return false;
  }

  const scrollRoot = findScrollContainer(targetElement) ?? rootElement;
  scrollIntoViewIfNeeded(editor, rect, scrollRoot);

  const updatedSelectionRect = getSelectionRect(targetElement);
  const visibleRect = updatedSelectionRect ?? targetElement.getBoundingClientRect();
  if (!isRectInView(visibleRect, scrollRoot)) {
    if (updatedSelectionRect) {
      scrollRectIntoView(scrollRoot, updatedSelectionRect);
    } else {
      targetElement.scrollIntoView({ block: 'nearest' });
    }
  }

  const finalRect = getSelectionRect(targetElement) ?? targetElement.getBoundingClientRect();
  return isRectInView(finalRect, scrollRoot);
}
