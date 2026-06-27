import { $createListItemNode, $createListNode, $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list';
import { act } from '@testing-library/react';
import { $createTextNode, $getRoot, $setState, createEditor, TextNode } from 'lexical';
import type { LexicalEditor, LexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $getNoteId, noteIdState } from '#client/editor/runtime/note-id-state';
import { meta } from '#tests';
import { $normalizeNoteIdsOnLoad } from '#client/editor/plugins/note-id-normalization';
import { getLastDescendantListItem, getSubtreeItems, getSubtreeTail, isWithinBoundary } from '#client/editor/outline/selection/tree';

function createListEditor(): { editor: LexicalEditor; dispose: () => void } {
  const editor = createEditor({
    namespace: 'selection-tree-stack-safety',
    nodes: [ListNode, ListItemNode, TextNode],
  });

  return {
    editor,
    dispose: () => {},
  };
}

function $buildDeepNestedOutline(depth: number): ListNode {
  const root = $getRoot();
  root.clear();
  const rootList = $createListNode('bullet');
  root.append(rootList);

  let currentList = rootList;
  for (let index = 0; index < depth; index += 1) {
    const content = $createListItemNode();
    $setState(content, noteIdState, `deep${index}`);
    content.append($createTextNode(`deep${index}`));
    currentList.append(content);

    if (index === depth - 1) {
      break;
    }

    const wrapper = $createListItemNode();
    const nested = $createListNode('bullet');
    wrapper.append(nested);
    currentList.append(wrapper);
    currentList = nested;
  }

  return rootList;
}

describe('selection tree helpers', () => {
  it('normalizes note ids in deep wrapper chains without stack overflow', meta({ fixture: 'flat' }), async () => {
    const depth = 2000;
    const leafNoteId = 'deepLeaf';
    const { editor, dispose } = createListEditor();

    const $buildDeepWrapperChain = (chainDepth: number): ListNode => {
      const root = $getRoot();
      root.clear();
      const rootList = $createListNode('bullet');
      root.append(rootList);

      let currentList = rootList;
      for (let index = 0; index < chainDepth; index += 1) {
        const wrapper = $createListItemNode();
        const nested = $createListNode('bullet');
        wrapper.append(nested);
        currentList.append(wrapper);
        currentList = nested;
      }

      const leaf = $createListItemNode();
      $setState(leaf, noteIdState, leafNoteId);
      leaf.append($createTextNode(leafNoteId));
      currentList.append(leaf);
      return rootList;
    };

    try {
      let resolvedLeafId: string | null = null;

      await act(async () => {
        editor.update(() => {
          const rootList = $buildDeepWrapperChain(depth);
          $normalizeNoteIdsOnLoad($getRoot(), 'docRoot');

          let currentList: ListNode = rootList;
          let leaf: ListItemNode | null = null;
          for (;;) {
            const firstNode: LexicalNode | null = currentList.getFirstChild();
            if (!$isListItemNode(firstNode)) {
              leaf = null;
              break;
            }

            const nestedNode: LexicalNode | null = firstNode.getFirstChild();
            if ($isListNode(nestedNode)) {
              currentList = nestedNode;
              continue;
            }

            leaf = firstNode;
            break;
          }

          resolvedLeafId = leaf ? $getNoteId(leaf) : null;
        });
      });

      expect(resolvedLeafId).toBe(leafNoteId);
    } finally {
      dispose();
    }
  });

  it('handles deep content chains without stack overflow', meta({ fixture: 'flat' }), async () => {
    const depth = 1000;
    const { editor, dispose } = createListEditor();

    try {
      let result: {
        count: number;
        firstId: string | null;
        tailId: string | null;
        lastId: string | null;
        lastCollectedId: string | null;
        leafNoteId: string | undefined;
      } | null = null;

      await act(async () => {
        editor.update(() => {
          const rootList = $buildDeepNestedOutline(depth);
          const first = rootList.getFirstChild() as ListItemNode;
          const items = getSubtreeItems(first);
          const tail = getSubtreeTail(first);
          const last = getLastDescendantListItem(rootList)!;

          result = {
            count: items.length,
            firstId: $getNoteId(items[0]!),
            tailId: $getNoteId(tail),
            lastId: $getNoteId(last),
            lastCollectedId: $getNoteId(items.at(-1)!),
            leafNoteId: $getNoteId(last) ?? undefined,
          };
        });
      });

      expect(result).not.toBeNull();
      expect(result!.count).toBe(depth);
      expect(result!.firstId).toBe('deep0');
      // getSubtreeTail returns the deepest content note, not a trailing wrapper.
      expect(result!.tailId).toBe(`deep${depth - 1}`);
      expect(result!.lastId).toBe(`deep${depth - 1}`);
      expect(result!.lastCollectedId).toBe(`deep${depth - 1}`);
      expect(result!.leafNoteId).toBe(`deep${depth - 1}`);
    } finally {
      dispose();
    }
  });
});

describe('isWithinBoundary', () => {
  // Builds: root0 (with nested child0) and a top-level sibling outside0.
  // Returns the three content items by role.
  function $buildBoundaryOutline(): { root0: ListItemNode; child0: ListItemNode; outside0: ListItemNode } {
    const root = $getRoot();
    root.clear();
    const rootList = $createListNode('bullet');
    root.append(rootList);

    const root0 = $createListItemNode();
    $setState(root0, noteIdState, 'root0');
    root0.append($createTextNode('root0'));
    rootList.append(root0);

    const wrapper = $createListItemNode();
    const nested = $createListNode('bullet');
    wrapper.append(nested);
    rootList.append(wrapper);

    const child0 = $createListItemNode();
    $setState(child0, noteIdState, 'child0');
    child0.append($createTextNode('child0'));
    nested.append(child0);

    const outside0 = $createListItemNode();
    $setState(outside0, noteIdState, 'outside0');
    outside0.append($createTextNode('outside0'));
    rootList.append(outside0);

    return { root0, child0, outside0 };
  }

  it('a null boundary means no limit — every item is within', meta({ fixture: 'flat' }), async () => {
    const { editor, dispose } = createListEditor();
    try {
      let results: boolean[] = [];
      await act(async () => {
        editor.update(() => {
          const { root0, child0, outside0 } = $buildBoundaryOutline();
          results = [root0, child0, outside0].map((item) => isWithinBoundary(item, null));
        });
      });
      expect(results).toEqual([true, true, true]);
    } finally {
      dispose();
    }
  });

  it('the boundary root and its descendants are within; outside notes are not', meta({ fixture: 'flat' }), async () => {
    const { editor, dispose } = createListEditor();
    try {
      let rootWithin = false;
      let childWithin = false;
      let outsideWithin = false;
      await act(async () => {
        editor.update(() => {
          const { root0, child0, outside0 } = $buildBoundaryOutline();
          rootWithin = isWithinBoundary(root0, root0);
          childWithin = isWithinBoundary(child0, root0);
          outsideWithin = isWithinBoundary(outside0, root0);
        });
      });
      expect(rootWithin).toBe(true);
      expect(childWithin).toBe(true);
      expect(outsideWithin).toBe(false);
    } finally {
      dispose();
    }
  });
});
