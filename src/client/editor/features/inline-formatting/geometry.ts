import { $getDOMTextNode } from 'lexical';
import type { LexicalEditor } from 'lexical';
import type { SelectedTextSlice } from './selection';

export interface ToolbarGeometry {
  anchor: { left: number; right: number; top: number; bottom: number };
  bounds: { left: number; right: number; top: number; bottom: number };
}

// Geometry is freshly derived from model text slices, never retained as the operand of an edit.
export function $measureToolbarGeometry(editor: LexicalEditor, slices: SelectedTextSlice[]): ToolbarGeometry | null {
  const root = editor.getRootElement();
  if (!root) return null;
  const win = root.ownerDocument.defaultView!;
  const viewport = win.visualViewport;
  const bounds = {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? win.innerWidth),
    bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? win.innerHeight),
  };
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width === 0 || rootRect.height === 0) return null;
  bounds.left = Math.max(bounds.left, rootRect.left);
  bounds.right = Math.min(bounds.right, rootRect.right);
  for (let ancestor: HTMLElement | null = root; ancestor; ancestor = ancestor.parentElement) {
    const style = win.getComputedStyle(ancestor);
    const rect = ancestor.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/u.test(style.overflowX)) {
      bounds.left = Math.max(bounds.left, rect.left + ancestor.clientLeft);
      bounds.right = Math.min(bounds.right, rect.left + ancestor.clientLeft + ancestor.clientWidth);
    }
    if (/auto|scroll|hidden|clip/u.test(style.overflowY)) {
      bounds.top = Math.max(bounds.top, rect.top + ancestor.clientTop);
      bounds.bottom = Math.min(bounds.bottom, rect.top + ancestor.clientTop + ancestor.clientHeight);
    }
  }

  const rects: DOMRect[] = [];
  for (const { node, start, end } of slices) {
    const element = editor.getElementByKey(node.getKey());
    if (!element) continue;
    const text = $getDOMTextNode(node, element, editor);
    if (!text || end > text.length) continue;
    const range = root.ownerDocument.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    rects.push(...Array.from(range.getClientRects()).filter(rect =>
      rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom
      && rect.right > bounds.left && rect.left < bounds.right));
  }
  const first = rects[0];
  if (!first) return null;
  // Only the first visible line supplies the horizontal anchor. Vertical
  // clearance covers every visible selected run, including on a below flip.
  const line = rects.filter(rect => Math.abs(rect.top - first.top) < 2);
  const anchor = {
    left: Math.max(bounds.left, Math.min(...line.map(rect => rect.left))),
    right: Math.min(bounds.right, Math.max(...line.map(rect => rect.right))),
    top: Math.max(bounds.top, Math.min(...rects.map(rect => rect.top))),
    bottom: Math.min(bounds.bottom, Math.max(...rects.map(rect => rect.bottom))),
  };
  return { anchor, bounds };
}

export function placeToolbar({ anchor, bounds }: ToolbarGeometry, width: number, height: number) {
  const inset = 4;
  const gap = 6;
  if (width > bounds.right - bounds.left - inset * 2 || height > bounds.bottom - bounds.top - inset * 2) return null;
  const left = Math.max(bounds.left + inset,
    Math.min((anchor.left + anchor.right - width) / 2, bounds.right - width - inset));
  const above = anchor.top - height - gap;
  const below = anchor.bottom + gap;
  const top = above >= bounds.top + inset ? above : below;
  if (top + height > bounds.bottom - inset) return null;
  return { left, top };
}
