import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

function isSerializedNode(value: unknown): value is SerializedLexicalNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return typeof (value as { type?: unknown }).type === 'string';
}

type SerializedNodeTransform = (node: SerializedLexicalNode) => SerializedLexicalNode;

interface TransformFrame {
  cloned: Record<string, unknown>;
  rawChildren: unknown[] | null;
  transformedChildren: unknown[] | null;
  childIndex: number;
}

function transformSerializedNode(
  node: SerializedLexicalNode,
  transform: SerializedNodeTransform,
): SerializedLexicalNode {
  const createFrame = (currentNode: SerializedLexicalNode): TransformFrame => {
    const cloned: Record<string, unknown> = { ...currentNode };
    const rawChildrenValue = (currentNode as { children?: unknown }).children;
    const rawChildren = Array.isArray(rawChildrenValue) ? rawChildrenValue : null;

    return {
      cloned,
      rawChildren,
      transformedChildren: rawChildren ? [] : null,
      childIndex: 0,
    };
  };

  const stack: TransformFrame[] = [createFrame(node)];
  let transformedRoot: SerializedLexicalNode | null = null;

  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.rawChildren && frame.childIndex < frame.rawChildren.length) {
      const child = frame.rawChildren[frame.childIndex];
      frame.childIndex += 1;

      if (isSerializedNode(child)) {
        stack.push(createFrame(child));
      } else {
        frame.transformedChildren!.push(child);
      }
      continue;
    }

    if (frame.transformedChildren) {
      frame.cloned.children = frame.transformedChildren;
    }
    const transformedNode = transform(frame.cloned as SerializedLexicalNode);
    stack.pop();

    const parent = stack.at(-1);
    if (!parent) {
      transformedRoot = transformedNode;
      break;
    }
    parent.transformedChildren!.push(transformedNode);
  }

  if (!transformedRoot) {
    throw new Error('Expected serialized state transform to produce a root node.');
  }

  return transformedRoot;
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
