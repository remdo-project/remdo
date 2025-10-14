import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import { act } from '@testing-library/react';
import { $getRoot, KEY_TAB_COMMAND } from 'lexical';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Helpers
 */
describe('indentation via KEY_TAB_COMMAND (flat fixture)', () => {
  let editor: LexicalEditor;
  let load: (filename: string) => void;
  let mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>;
  let validate: <T>(fn: () => T) => T;

  beforeEach(({ lexical }) => {
    ({ editor, load, mutate, validate } = lexical);
  });

  const placeCaretAtNoteStart = async (noteText: string) => {
    await mutate(() => {
      const root = $getRoot();
      const list = root.getFirstChild();
      if (!list) throw new Error('Expected a list root');

      const findItemByText = (listNode: any): any => {
        const items = listNode?.getChildren?.() ?? [];
        for (const item of items) {
          if (!item || typeof item.getChildren !== 'function') {
            continue;
          }

          const children = item.getChildren();
          const contentNodes = children.filter(
            (child: any) => typeof child.getType === 'function' && child.getType() !== 'list'
          );
          const text = contentNodes
            .map((child: any) => child?.getTextContent?.() ?? '')
            .join('')
            .trim();

          if (text === noteText) {
            return item;
          }

          const nestedLists = children.filter(
            (child: any) => typeof child.getType === 'function' && child.getType() === 'list'
          );
          for (const nested of nestedLists) {
            const found = findItemByText(nested);
            if (found) return found;
          }
        }
        return null;
      };

      const item = findItemByText(list);
      if (!item) throw new Error(`No list item found with text: ${noteText}`);
      if (typeof item.selectStart !== 'function') {
        throw new TypeError('Expected list item to support selectStart');
      }
      item.selectStart(); // caret at start
    });
  };

  const pressTab = async (opts: { shift?: boolean } = {}) => {
    const { shift = false } = opts;
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
      shiftKey: shift,
    });
    await act(async () => {
      editor.dispatchCommand(KEY_TAB_COMMAND, event);
    });
  };

  const readOutline = () => {
    // Returns a simple nested structure of the current list: [{ text, children: [...] }]
    return validate(() => {
      const root = $getRoot();
      const list = root.getFirstChild();
      if (!list) return [];

      const flat: Array<{ text: string; indent: number }> = [];

      const collectItems = (listNode: any) => {
        const items = listNode?.getChildren?.() ?? [];
        for (const item of items) {
          if (!item || typeof item.getChildren !== 'function') {
            continue;
          }

          const indent = typeof item.getIndent === 'function' ? item.getIndent() : 0;
          const children = item.getChildren();
          const contentNodes = children.filter(
            (child: any) => typeof child.getType === 'function' && child.getType() !== 'list'
          );
          const text = contentNodes
            .map((child: any) => child?.getTextContent?.() ?? '')
            .join('')
            .trim();

          flat.push({ text, indent });

          const nestedLists = children.filter(
            (child: any) => typeof child.getType === 'function' && child.getType() === 'list'
          );
          for (const nested of nestedLists) {
            collectItems(nested);
          }
        }
      };

      collectItems(list);

      const outline: Array<{ text: string; children: any[] }> = [];
      const stack: Array<{ indent: number; children: Array<{ text: string; children: any[] }> }> = [
        { indent: -1, children: outline },
      ];

      for (const { text, indent } of flat) {
        if (!text) {
          continue;
        }

        const node = { text, children: [] as Array<{ text: string; children: any[] }> };
        while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
          stack.pop();
        }

        stack[stack.length - 1]?.children.push(node);
        stack.push({ indent, children: node.children });
      }

      return outline;
    });
  };

  it('tab on note0 at start is a no-op (no structure change)', async () => {
    load('flat');

    const before = readOutline();

    await placeCaretAtNoteStart('note0');
    await pressTab(); // indent attempt on first root item

    const after = readOutline();
    expect(after).toEqual(before);
  });

  it("tab on note1 at start nests it under note0; note2 stays at root", async () => {
    load('flat');

    await placeCaretAtNoteStart('note1');
    await pressTab(); // indent note1 under note0

    const outline = readOutline();

    // Expectation assumes the flat fixture has three items: note0, note1, note2
    // After indenting note1, it should become a child of note0, while note2 remains at root
    expect(outline).toEqual([
      { text: 'note0', children: [ { text: 'note1', children: [] } ] },
      { text: 'note2', children: [] },
    ]);
  });
});
