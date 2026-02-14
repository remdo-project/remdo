import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

function isSerializedNode(value: unknown): value is SerializedLexicalNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return typeof (value as { type?: unknown }).type === 'string';
}

type SerializedNodeTransform = (node: SerializedLexicalNode) => SerializedLexicalNode;

function transformSerializedNode(
  node: SerializedLexicalNode,
  transform: SerializedNodeTransform,
): SerializedLexicalNode {
  const cloned: Record<string, unknown> = { ...node };
  const rawChildren = (node as { children?: unknown }).children;

  if (Array.isArray(rawChildren)) {
    const transformedChildren: unknown[] = [];
    for (const child of rawChildren) {
      if (isSerializedNode(child)) {
        transformedChildren.push(transformSerializedNode(child, transform));
      } else {
        transformedChildren.push(child);
      }
    }
    cloned.children = transformedChildren;
  }

  return transform(cloned as SerializedLexicalNode);
}

export function transformSerializedEditorState(
  state: SerializedEditorState,
  transform: SerializedNodeTransform,
): SerializedEditorState {
  const root = (state as { root?: unknown }).root;
  if (!isSerializedNode(root)) {
    return structuredClone(state);
  }

  const transformedRoot = transformSerializedNode(root, transform);
  return {
    ...state,
    root: transformedRoot as SerializedEditorState['root'],
  };
}
