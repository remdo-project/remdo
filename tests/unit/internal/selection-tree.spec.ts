import { $createListItemNode, $createListNode, $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list';
import { act } from '@testing-library/react';
import { $createTextNode, $getRoot, $setState, createEditor, TextNode } from 'lexical';
import type { LexicalEditor, LexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { meta } from '#tests';
import { $normalizeNoteIdsOnLoad } from '@/editor/plugins/note-id-normalization';
import { getLastDescendantListItem, getSubtreeItems, getSubtreeTail } from '@/editor/outline/selection/tree';

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
          const first = rootList.getFirstChild();
          if (!$isListItemNode(first)) {
            throw new Error('Expected first root-list child to be a content list item.');
          }

          const items = getSubtreeItems(first);
          const tail = getSubtreeTail(first);
          const last = getLastDescendantListItem(rootList);
          if (!last) {
            throw new Error('Expected deep outline to have a last descendant list item.');
          }

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
      expect(result!.tailId).toBeNull();
      expect(result!.lastId).toBe(`deep${depth - 1}`);
      expect(result!.lastCollectedId).toBe(`deep${depth - 1}`);
      expect(result!.leafNoteId).toBe(`deep${depth - 1}`);
    } finally {
      dispose();
    }
  });
});
