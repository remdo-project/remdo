import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import {
  collectSerializedNodes,
  findSerializedNode,
  forEachSerializedNode,
  getSerializedNodeChildren,
  getSerializedRootNodes,
} from '#tests';
import { transformSerializedEditorState } from '#lib/editor/serialized-editor-state';

type NodeWithChildren = SerializedLexicalNode & { children: SerializedLexicalNode[] };

function createState(): SerializedEditorState {
  const noteLinkNode: SerializedLexicalNode & { noteId: string } = {
    type: 'note-link',
    version: 1,
    noteId: 'target',
  };
  const firstListItemNode: NodeWithChildren & { noteId: string } = {
    type: 'listitem',
    version: 1,
    noteId: 'note1',
    children: [noteLinkNode],
  };
  const secondListItemNode: NodeWithChildren & { noteId: string } = {
    type: 'listitem',
    version: 1,
    noteId: 'note2',
    children: [],
  };
  const listNode: NodeWithChildren = {
    type: 'list',
    version: 1,
    children: [firstListItemNode, secondListItemNode],
  };
  const root: SerializedEditorState['root'] = {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [listNode],
  };

  return {
    root,
  };
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
    const child: SerializedLexicalNode & { depth: number; children: SerializedLexicalNode[] } = {
      type: 'listitem',
      version: 1,
      depth: index,
      children: [],
    };
    current.children = [child];
    current = child;
  }

  const leaf: SerializedLexicalNode & { text: string } = { type: 'text', version: 1, text: 'leaf' };
  current.children = [leaf];
  return { root };
}

describe('serialized editor state helper', () => {
  it('traverses nodes in preorder DFS', () => {
    const state = createState();
    const visited: string[] = [];

    forEachSerializedNode(state, (node) => {
      visited.push(node.type);
    });

    expect(visited).toEqual(['root', 'list', 'listitem', 'note-link', 'listitem']);
  });

  it('finds and collects matching serialized nodes', () => {
    const state = createState();
    const rootNodes = getSerializedRootNodes(state);

    const firstLink = findSerializedNode(
      rootNodes,
      (node): node is SerializedLexicalNode & { noteId?: unknown } => node.type === 'note-link',
    );
    const listItems = collectSerializedNodes(
      rootNodes,
      (node): node is SerializedLexicalNode & { noteId?: unknown } => node.type === 'listitem',
    );

    expect(firstLink?.noteId).toBe('target');
    expect(listItems).toHaveLength(2);
  });

  it('transforms state without mutating the input', () => {
    const state = createState();
    const transformed = transformSerializedEditorState(state, (node) => {
      if (node.type !== 'note-link') {
        return node;
      }
      return {
        ...node,
        docId: 'docA',
      };
    });

    const transformedLinks = collectSerializedNodes(
      getSerializedRootNodes(transformed),
      (node): node is SerializedLexicalNode & { docId?: unknown } => node.type === 'note-link',
    );
    const originalLinks = collectSerializedNodes(
      getSerializedRootNodes(state),
      (node): node is SerializedLexicalNode & { docId?: unknown } => node.type === 'note-link',
    );

    expect(transformed).not.toBe(state);
    expect(transformed.root).not.toBe(state.root);
    expect(transformedLinks[0]?.docId).toBe('docA');
    expect(originalLinks[0]?.docId).toBeUndefined();
  });

  it('tolerates malformed children values', () => {
    const malformedRoot: SerializedEditorState['root'] = {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: 'not-an-array' as unknown as SerializedLexicalNode[],
    };
    const malformedState: SerializedEditorState = {
      root: malformedRoot,
    };

    const mixedChildren: SerializedLexicalNode & { children: unknown[] } = {
      type: 'custom',
      version: 1,
      children: [null, 1, { type: 'text', version: 1 }],
    };

    expect(getSerializedRootNodes(malformedState)).toEqual([]);
    expect(getSerializedNodeChildren(mixedChildren).map((node) => node.type)).toEqual(['text']);
  });

  it('preserves malformed child entries while recursing into valid nodes', () => {
    const stateWithMalformedChildren: SerializedEditorState = {
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
            type: 'list',
            version: 1,
            children: [
              [] as unknown as SerializedLexicalNode,
              { malformed: true } as unknown as SerializedLexicalNode,
              { type: 'listitem', version: 1, children: [] },
            ],
          } as unknown as SerializedLexicalNode,
        ],
      },
    };

    const transformed = transformSerializedEditorState(stateWithMalformedChildren, (node) => node);
    const rootChildren = getSerializedRootNodes(transformed);
    const nestedChildren = getSerializedNodeChildren(rootChildren[0]! as SerializedLexicalNode & { children: unknown[] });

    const rawNestedChildren = (rootChildren[0]! as SerializedLexicalNode & { children: unknown[] }).children;
    expect(Array.isArray(rawNestedChildren[0])).toBe(true);
    expect(rawNestedChildren[0]).toEqual([]);
    expect(rawNestedChildren[1]).toEqual({ malformed: true });
    expect(nestedChildren.at(-1)?.type).toBe('listitem');
  });

  it('transforms deep single-child chains without stack overflow', () => {
    const depth = 30_000;
    const state = createDeepChainState(depth);

    const transformed = transformSerializedEditorState(state, (node) => (
      node.type === 'listitem' ? { ...node, touched: true } : node
    ));

    const transformedItems = collectSerializedNodes(
      getSerializedRootNodes(transformed),
      (node): node is SerializedLexicalNode & { touched?: unknown } => node.type === 'listitem',
    );
    const originalItems = collectSerializedNodes(
      getSerializedRootNodes(state),
      (node): node is SerializedLexicalNode & { touched?: unknown } => node.type === 'listitem',
    );

    expect(transformedItems).toHaveLength(depth);
    expect(transformedItems.every((node) => node.touched === true)).toBe(true);
    expect(originalItems.every((node) => node.touched === undefined)).toBe(true);
  });
});
