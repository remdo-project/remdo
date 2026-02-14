import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { collectSerializedNodes, getSerializedRootNodes } from '#tests';
import { restoreEditorStateDefaults, stripEditorStateDefaults } from '#lib/editor/editor-state-defaults';

interface DeepListItemNode extends SerializedLexicalNode {
  type: 'listitem';
  format: string;
  indent: number;
  direction: null;
  noteId: string;
  children: SerializedLexicalNode[];
}

interface DeepTextNode extends SerializedLexicalNode {
  type: 'text';
  detail: number;
  format: number;
  mode: string;
  style: string;
  text: string;
}

function createDeepChainState(depth: number): SerializedEditorState {
  const root: SerializedEditorState['root'] = {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [],
  };

  let current: SerializedLexicalNode & { children?: SerializedLexicalNode[] } = root;
  for (let index = 0; index < depth; index += 1) {
    const child: DeepListItemNode = {
      type: 'listitem',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      noteId: `deep${index}`,
      children: [],
    };
    current.children = [child];
    current = child;
  }

  const leaf: DeepTextNode = {
    type: 'text',
    version: 1,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text: 'leaf',
  };
  current.children = [leaf];
  return { root };
}

describe('editor state defaults helpers', () => {
  it('strips and restores deep single-child chains without stack overflow', () => {
    const depth = 12_000;
    const state = createDeepChainState(depth);

    const stripped = stripEditorStateDefaults(state);
    const restored = restoreEditorStateDefaults(stripped);

    const strippedItems = collectSerializedNodes(
      getSerializedRootNodes(stripped),
      (node): node is SerializedLexicalNode & { noteId?: unknown } => node.type === 'listitem',
    );
    const restoredItems = collectSerializedNodes(
      getSerializedRootNodes(restored),
      (node): node is SerializedLexicalNode & { noteId?: unknown } => node.type === 'listitem',
    );

    expect(strippedItems).toHaveLength(depth);
    expect(restoredItems).toHaveLength(depth);
    expect((stripped.root as { version?: unknown }).version).toBeUndefined();
    expect((restored.root as { version?: unknown }).version).toBe(1);
    expect((state.root as { version?: unknown }).version).toBe(1);
  });
});
