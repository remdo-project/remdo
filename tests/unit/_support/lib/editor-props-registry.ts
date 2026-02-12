import type { ComponentProps } from 'react';
import type Editor from '@/editor/Editor';

type EditorProps = Partial<ComponentProps<typeof Editor>>;

const registry = new Map<string, EditorProps>();
let propsKeyCounter = 0;

export function registerEditorProps(key: string, props: EditorProps): string {
  registry.set(key, props);
  return key;
}

export function registerScopedEditorProps(prefix: string, props: EditorProps): string {
  propsKeyCounter += 1;
  return registerEditorProps(`${prefix}-${propsKeyCounter}`, props);
}

export function getEditorProps(key: string): EditorProps | null {
  return registry.get(key) ?? null;
}

export function clearEditorProps(key: string): void {
  registry.delete(key);
}
