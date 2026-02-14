import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { transformSerializedEditorState } from '#lib/editor/serialized-editor-state';

type DefaultEntry = Record<string, unknown>;

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
  },
  text: {
    version: 1,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
  },
  'note-link': {
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    rel: null,
    target: null,
    title: null,
  },
} as const satisfies Record<string, DefaultEntry>;

export function stripEditorStateDefaults(editorState: SerializedEditorState): SerializedEditorState {
  return transformSerializedEditorState(editorState, minifyNode);
}

export function restoreEditorStateDefaults(editorState: SerializedEditorState): SerializedEditorState {
  return transformSerializedEditorState(editorState, restoreDefaultsForNode);
}

function getNodeDefaults(nodeType: string): Record<string, unknown> {
  const defaultsEntry = Object.prototype.hasOwnProperty.call(NODE_DEFAULTS, nodeType)
    ? NODE_DEFAULTS[nodeType as keyof typeof NODE_DEFAULTS]
    : undefined;
  return (defaultsEntry ?? {}) as Record<string, unknown>;
}

function minifyNode(node: SerializedLexicalNode): SerializedLexicalNode {
  const defaults = getNodeDefaults(node.type);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === 'children') {
      if (Array.isArray(value)) {
        result.children = value;
      }
      continue;
    }

    const defaultValue = defaults[key];
    if (defaultValue !== undefined && isEqual(value, defaultValue)) {
      continue;
    }

    result[key] = value;
  }

  return sortKeys(result) as SerializedLexicalNode;
}

function restoreDefaultsForNode(node: SerializedLexicalNode): SerializedLexicalNode {
  const defaults = getNodeDefaults(node.type);
  const result: Record<string, unknown> = { ...node };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in result)) {
      result[key] = defaultValue;
    }
  }

  return result as SerializedLexicalNode;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => isEqual(value, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => isEqual(a[key], b[key]));
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
      sorted[key] = value.map((item) => (isPlainObject(item) ? sortKeys(item) : item));
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
