import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

type NodeWithChildren = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
};

const ALWAYS_STRIP = Symbol('minifyEditorState.alwaysStrip');

type DefaultEntry = Record<string, unknown> & Partial<Record<string | typeof ALWAYS_STRIP, unknown>>;

const NODE_DEFAULTS = {
  root: {
    version: 1,
    format: '',
    indent: 0,
    direction: null,
  },
  list: {
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    listType: 'bullet',
    start: 1,
    tag: 'ul',
  },
  listitem: {
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    value: ALWAYS_STRIP,
  },
  text: {
    version: 1,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
  },
} as const satisfies Record<string, DefaultEntry>;

export function minifyEditorState(editorState: SerializedEditorState): SerializedEditorState {
  return {
    root: minifyNode(editorState.root) as SerializedEditorState['root'],
  };
}

function minifyNode(node: NodeWithChildren): NodeWithChildren {
  const minifiedChildren = Array.isArray(node.children)
    ? node.children.map((child) => minifyNode(child))
    : undefined;

  const defaultsEntry = Object.prototype.hasOwnProperty.call(NODE_DEFAULTS, node.type)
    ? NODE_DEFAULTS[node.type as keyof typeof NODE_DEFAULTS]
    : undefined;

  const defaults = (defaultsEntry ?? {}) as Record<string | typeof ALWAYS_STRIP, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === 'children') {
      if (minifiedChildren) {
        result.children = minifiedChildren;
      } else if (Array.isArray(value) && value.length === 0) {
        result.children = [];
      }
      continue;
    }

    const defaultValue = defaults[key];
    if (defaultValue === ALWAYS_STRIP) {
      continue;
    }

    if (defaultValue !== undefined && isEqual(value, defaultValue)) {
      continue;
    }

    result[key] = value;
  }

  return sortKeys(result) as NodeWithChildren;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => isEqual(value, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  }

  return a === b;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(obj);

  entries.sort(([keyA, valueA], [keyB, valueB]) => {
    const complexA = isComplex(valueA);
    const complexB = isComplex(valueB);

    if (complexA !== complexB) {
      return complexA ? 1 : -1;
    }

    return keyA.localeCompare(keyB);
  });

  const sorted: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      sorted[key] = value.map((item) => (isPlainObject(item) ? sortKeys(item as Record<string, unknown>) : item));
    } else if (isPlainObject(value)) {
      sorted[key] = sortKeys(value);
    } else {
      sorted[key] = value;
    }
  }

  return sorted;
}

function isComplex(value: unknown): boolean {
  return Array.isArray(value) || isPlainObject(value);
}
