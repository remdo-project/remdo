import type { LexicalEditor } from 'lexical';

import type { OutlineSelectionRange } from './model';

export interface StructuralOverlayConfig {
  className: string;
  topVar: string;
  heightVar: string;
}

export function clearStructuralOverlay(rootElement: HTMLElement | null, config: StructuralOverlayConfig): void {
  if (!rootElement) {
    return;
  }

  rootElement.classList.remove(config.className);
  rootElement.style.removeProperty(config.topVar);
  rootElement.style.removeProperty(config.heightVar);
}

export function updateStructuralOverlay(
  editor: LexicalEditor,
  range: OutlineSelectionRange | null,
  isActive: boolean,
  config: StructuralOverlayConfig,
  rootElement: HTMLElement | null = editor.getRootElement()
): void {
  if (!rootElement) {
    return;
  }

  rootElement.classList.toggle(config.className, isActive);

  if (!isActive || !range) {
    rootElement.style.removeProperty(config.topVar);
    rootElement.style.removeProperty(config.heightVar);
    return;
  }

  const startElement = editor.getElementByKey(range.visualStartKey);
  const endElement = editor.getElementByKey(range.visualEndKey);
  if (!startElement || !endElement) {
    clearStructuralOverlay(rootElement, config);
    return;
  }

  const rootRect = rootElement.getBoundingClientRect();
  const startRect = startElement.getBoundingClientRect();
  const endRect = endElement.getBoundingClientRect();
  const scrollTop = rootElement.scrollTop;
  const top = startRect.top - rootRect.top + scrollTop;
  const bottom = endRect.bottom - rootRect.top + scrollTop;
  const height = Math.max(0, bottom - top);

  rootElement.style.setProperty(config.topVar, `${top}px`);
  rootElement.style.setProperty(config.heightVar, `${height}px`);
}
