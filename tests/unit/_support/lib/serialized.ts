/**
 * Helpers for traversing Lexical serialized nodes (plain JSON objects),
 * not live LexicalNode runtime instances.
 *
 * This representation is used at serialization boundaries:
 * - editor-state JSON (`editor.getEditorState().toJSON()`),
 * - clipboard payloads (`application/x-lexical-editor`),
 * - import/export paths (`importJSON` / `exportJSON`).
 */
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

export function getSerializedNodeChildren(node: SerializedLexicalNode | null | undefined): SerializedLexicalNode[] {
  const children = (node as { children?: unknown } | null | undefined)?.children;
  if (!Array.isArray(children)) {
    return [];
  }

  const collected: SerializedLexicalNode[] = [];
  for (const child of children) {
    if (child && typeof child === 'object') {
      collected.push(child as SerializedLexicalNode);
    }
  }
  return collected;
}

export function getSerializedRootNodes(state: SerializedEditorState): SerializedLexicalNode[] {
  const root = (state as { root?: { children?: unknown } }).root;
  return Array.isArray(root?.children) ? (root.children as SerializedLexicalNode[]) : [];
}

export function forEachSerializedNode(state: SerializedEditorState, visit: (node: SerializedLexicalNode) => void): void {
  const stack: SerializedLexicalNode[] = [state.root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    visit(node);

    const children = getSerializedNodeChildren(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child) {
        stack.push(child);
      }
    }
  }
}

export function findSerializedNode<T extends SerializedLexicalNode>(
  nodes: SerializedLexicalNode[] | undefined,
  predicate: (node: SerializedLexicalNode) => node is T
): T | null {
  if (!nodes) {
    return null;
  }

  const stack = nodes.toReversed();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (predicate(node)) {
      return node;
    }

    const children = getSerializedNodeChildren(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child) {
        stack.push(child);
      }
    }
  }

  return null;
}

export function collectSerializedNodes<T extends SerializedLexicalNode>(
  nodes: SerializedLexicalNode[] | undefined,
  predicate: (node: SerializedLexicalNode) => node is T
): T[] {
  if (!nodes) {
    return [];
  }

  const stack = nodes.toReversed();
  const collected: T[] = [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (predicate(node)) {
      collected.push(node);
    }

    const children = getSerializedNodeChildren(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child) {
        stack.push(child);
      }
    }
  }

  return collected;
}
