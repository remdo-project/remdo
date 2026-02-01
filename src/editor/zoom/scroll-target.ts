import type { LexicalEditor } from 'lexical';

type ScrollTarget = { key: string; deadline: number } | null;

const scrollTargetStore = new WeakMap<LexicalEditor, ScrollTarget>();

const nowMs = () => {
  return typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
};

export function setZoomScrollTarget(editor: LexicalEditor, key: string): void {
  scrollTargetStore.set(editor, { key, deadline: nowMs() + 1000 });
}

export function getZoomScrollTarget(editor: LexicalEditor): ScrollTarget {
  return scrollTargetStore.get(editor) ?? null;
}

export function clearZoomScrollTarget(editor: LexicalEditor): void {
  scrollTargetStore.set(editor, null);
}

export function isZoomScrollTargetExpired(target: ScrollTarget): boolean {
  if (!target) {
    return true;
  }
  return nowMs() > target.deadline;
}
