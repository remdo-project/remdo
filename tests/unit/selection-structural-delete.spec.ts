import { describe, it, expect } from 'vitest';
import { $getRoot } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';

import { placeCaretAtNote, pressKey } from '#tests';

describe('structural selection delete regression (local)', () => {
  it('bubbles Delete when structural heads were removed remotely', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    const expectedAfterRemoteDelete = [
      { text: 'note1', children: [{ text: 'note4' }] },
      { text: 'note5' },
      { text: 'note6', children: [{ text: 'note7' }] },
    ];

    await remdo.mutate(() => {
      const root = $getRoot();
      const list = root.getFirstChild();
      if (!list || !$isListNode(list)) {
        return;
      }
//TODO simplify all of that
      const isWrapperItem = (node: unknown) => {
        if (!$isListItemNode(node)) return false;
        const children = node.getChildren();
        return children.length === 1 && $isListNode(children[0] ?? null);
      };

      const readContentLabel = (item: unknown): string => {
        if (!$isListItemNode(item)) return '';
        const children = item.getChildren();
        const contentNodes = children.filter((child) => !$isListNode(child));
        return contentNodes.map((child) => child.getTextContent()).join('');
      };

      const removeByText = (node: typeof list, target: string): boolean => {
        const children = node.getChildren();

        for (let index = 0; index < children.length; index += 1) {
          const child = children[index];

          if ($isListItemNode(child)) {
            if (isWrapperItem(child)) {
              const nested = child.getChildren().find($isListNode);
              if (nested && removeByText(nested, target)) {
                return true;
              }
              continue;
            }

            const label = readContentLabel(child);
            if (label === target) {
              child.remove();
              const maybeWrapper = children[index + 1];
              if (isWrapperItem(maybeWrapper)) {
                maybeWrapper.remove();
              }
              return true;
            }

            const maybeWrapper = children[index + 1];
            if (isWrapperItem(maybeWrapper)) {
              const nested = maybeWrapper.getChildren().find($isListNode);
              if (nested && removeByText(nested, target)) {
                return true;
              }
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

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Lexical root element is not mounted');
    }

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

  it('bubbles Backspace when structural heads were removed remotely', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note6');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    const expectedAfterRemoteDelete = [
      {
        text: 'note1',
        children: [
          { text: 'note2', children: [{ text: 'note3' }] },
          { text: 'note4' },
        ],
      },
      { text: 'note5' },
    ];

    await remdo.mutate(() => {
      const root = $getRoot();
      const list = root.getFirstChild();
      if (!list || !$isListNode(list)) {
        return;
      }

      const isWrapperItem = (node: unknown) => {
        if (!$isListItemNode(node)) return false;
        const children = node.getChildren();
        return children.length === 1 && $isListNode(children[0] ?? null);
      };

      const readContentLabel = (item: unknown): string => {
        if (!$isListItemNode(item)) return '';
        const children = item.getChildren();
        const contentNodes = children.filter((child) => !$isListNode(child));
        return contentNodes.map((child) => child.getTextContent()).join('');
      };

      const removeByText = (node: typeof list, target: string): boolean => {
        const children = node.getChildren();

        for (let index = 0; index < children.length; index += 1) {
          const child = children[index];

          if ($isListItemNode(child)) {
            if (isWrapperItem(child)) {
              const nested = child.getChildren().find($isListNode);
              if (nested && removeByText(nested, target)) {
                return true;
              }
              continue;
            }

            const label = readContentLabel(child);
            if (label === target) {
              child.remove();
              const maybeWrapper = children[index + 1];
              if (isWrapperItem(maybeWrapper)) {
                maybeWrapper.remove();
              }
              return true;
            }

            const maybeWrapper = children[index + 1];
            if (isWrapperItem(maybeWrapper)) {
              const nested = maybeWrapper.getChildren().find($isListNode);
              if (nested && removeByText(nested, target)) {
                return true;
              }
            }
          } else if ($isListNode(child) && removeByText(child, target)) {
            return true;
          }
        }

        return false;
      };

      removeByText(list, 'note6');
      removeByText(list, 'note7');
    });

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Lexical root element is not mounted');
    }

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
