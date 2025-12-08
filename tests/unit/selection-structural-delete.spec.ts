import { describe, it, expect } from 'vitest';
import { $getRoot } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';

import { placeCaretAtNote, readOutline, pressKey } from '#tests';

describe('structural selection delete regression (local)', () => {
  it.skip('bubbles Delete when structural heads were removed remotely', async ({ remdo }) => {
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

      for (const item of list.getChildren()) {
        if (!$isListItemNode(item)) continue;
        const content = item
          .getChildren()
          .find(
            (child) =>
              typeof child.getTextContent === 'function' && typeof child.getType === 'function' && child.getType() !== 'list'
          );
        const text = typeof content?.getTextContent === 'function' ? content.getTextContent().trim() : '';
        if (text === 'note2') {
          item.remove();
          break;
        }
      }
    });

    // Local Delete should bubble (no changes) and not throw despite stale selection.
    await pressKey(remdo, { key: 'Delete' });

    expect(readOutline(remdo)).toEqual(expectedAfterRemoteDelete);
  });
});
