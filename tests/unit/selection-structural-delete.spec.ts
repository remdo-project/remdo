import { describe, it, expect } from 'vitest';
import type { LexicalNode } from 'lexical';
import { $getRoot } from 'lexical';
import type { ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';

import { getRootElementOrThrow, selectStructuralNotes, meta } from '#tests';

function readWrapperChildList(wrapper: LexicalNode | null | undefined): ListNode | null {
  if (!wrapper || !$isListItemNode(wrapper)) return null;
  const children = wrapper.getChildren();
  return children.length === 1 && $isListNode(children[0] ?? null) ? (children[0] as ListNode) : null;
}

describe('structural selection delete regression (local)', () => {
  it('bubbles Delete when structural heads were removed remotely', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await selectStructuralNotes(remdo, 'note2', 'note3');

    const expectedAfterRemoteDelete = [
      { noteId: 'note1', text: 'note1', children: [{ noteId: 'note4', text: 'note4' }] },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ];

    await remdo.mutate(() => {
      const root = $getRoot();
      const list = root.getFirstChild() as ListNode;

      const rootItems = list.getChildren();
      const note1ChildItems = readWrapperChildList(rootItems[1])!.getChildren();
      const note2Item = note1ChildItems[0];
      const note2Wrapper = note1ChildItems[1];
      note2Wrapper?.remove();
      note2Item?.remove();
    });

    const rootElement = getRootElementOrThrow(remdo.editor);

    let bubbled = false;
    const bubbleProbe = () => {
      bubbled = true;
    };
    document.body.addEventListener('keydown', bubbleProbe);

    const deleteEvent = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    rootElement.dispatchEvent(deleteEvent);

    document.body.removeEventListener('keydown', bubbleProbe);

    expect(bubbled).toBe(true);
    expect(remdo).toMatchOutline(expectedAfterRemoteDelete);
  });

  it('bubbles Backspace when structural heads were removed remotely', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await selectStructuralNotes(remdo, 'note6', 'note7');

    const expectedAfterRemoteDelete = [
      {
        noteId: 'note1', text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
    ];

    await remdo.mutate(() => {
      const root = $getRoot();
      const list = root.getFirstChild() as ListNode;

      const rootItems = list.getChildren();
      const note6Item = rootItems[3];
      const note6Wrapper = rootItems[4];
      note6Wrapper?.remove();
      note6Item?.remove();
    });

    const rootElement = getRootElementOrThrow(remdo.editor);

    let bubbled = false;
    const bubbleProbe = () => {
      bubbled = true;
    };
    document.body.addEventListener('keydown', bubbleProbe);

    const backspaceEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    rootElement.dispatchEvent(backspaceEvent);

    document.body.removeEventListener('keydown', bubbleProbe);

    expect(bubbled).toBe(true);
    expect(remdo).toMatchOutline(expectedAfterRemoteDelete);
  });
});
