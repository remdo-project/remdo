import { describe, it, expect } from 'vitest';
import { $getRoot } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';

import { placeCaretAtNote, readOutline, pressKey } from '#tests';

describe('structural selection delete regression (local)', () => {
  it('bubbles Delete when structural heads were removed remotely', async ({ remdo }) => {
    await remdo.load('tree_complex');

    // Promote to stage 2: note2 + note3 subtree.
    await placeCaretAtNote('note2', remdo);
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    const expectedAfterRemoteDelete = [
      { text: 'note1', children: [ { text: 'note4', children: [] } ] },
      { text: 'note5', children: [] },
      { text: 'note6', children: [ { text: 'note7', children: [] } ] },
    ];

    // Simulate remote delete by removing note2 subtree without touching local selection refs.
    await remdo.mutate(() => {
      const root = $getRoot();
      const list = root.getFirstChild();
      if (!list || !$isListNode(list)) {
        return;
      }

      const removeByText = (node: typeof list, target: string): boolean => {
        for (const child of node.getChildren()) {
          if ($isListItemNode(child)) {
            if (child.getTextContent().trim() === target) {
              child.remove();
              return true;
            }
            const nestedList = child.getChildren().find($isListNode);
            if (nestedList && removeByText(nestedList, target)) {
              return true;
            }
          } else if ($isListNode(child) && removeByText(child, target)) {
            return true;
          }
        }
        return false;
      };

      removeByText(list, 'note2');
      removeByText(list, 'note3');
    });

    // Local Delete should bubble (no changes) and not throw despite stale selection.
    await pressKey(remdo, { key: 'Delete' });

    expect(readOutline(remdo)).toEqual(expectedAfterRemoteDelete);
  });
});
