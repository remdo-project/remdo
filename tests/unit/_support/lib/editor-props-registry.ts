import type { ComponentProps } from 'react';
import type Editor from '@/editor/Editor';

type EditorProps = Partial<ComponentProps<typeof Editor>>;

const registry = new Map<string, EditorProps>();

export function registerEditorProps(key: string, props: EditorProps): string {
  registry.set(key, props);
  return key;
}

export function getEditorProps(key: string): EditorProps | null {
  return registry.get(key) ?? null;
}

export function clearEditorProps(key: string): void {
  registry.delete(key);
}
