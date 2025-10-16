import type { EditorUpdateOptions } from 'lexical';
import { $getRoot } from 'lexical';

function findItemByText(listNode: any, noteText: string): any {
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
      const found = findItemByText(nested, noteText);
      if (found) return found;
    }
  }
  return null;
}

export async function placeCaretAtNoteStart(
  noteText: string,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>
) {
  await mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) throw new Error('Expected a list root');

    const item = findItemByText(list, noteText);
    if (!item) throw new Error(`No list item found with text: ${noteText}`);
    if (typeof item.selectStart !== 'function') {
      throw new TypeError('Expected list item to support selectStart');
    }
    item.selectStart(); // caret at start
  });
}

export async function placeCaretAtNoteEnd(
  noteText: string,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>
) {
  await mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) throw new Error('Expected a list root');

    const item = findItemByText(list, noteText);
    if (!item) throw new Error(`No list item found with text: ${noteText}`);
    if (typeof item.selectEnd !== 'function') {
      throw new TypeError('Expected list item to support selectEnd');
    }
    item.selectEnd(); // caret at end
  });
}

export async function placeCaretInNote(
  noteText: string,
  offset: number,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>
) {
  await mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) throw new Error('Expected a list root');

    const item = findItemByText(list, noteText);
    if (!item) throw new Error(`No list item found with text: ${noteText}`);

    // Get the first text node in the item
    const children = item.getChildren();
    const textNode = children.find((child: any) =>
      typeof child.getType === 'function' && child.getType() === 'text'
    );

    if (!textNode || typeof textNode.select !== 'function') {
      throw new TypeError('Expected to find a text node with select method');
    }

    // Place caret at the specified offset
    textNode.select(offset, offset);
  });
}

export function readOutline(validate: <T>(fn: () => T) => T) {
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

        const children = item.getChildren();
        const nestedLists = children.filter(
          (child: any) => typeof child.getType === 'function' && child.getType() === 'list'
        );

        if (nestedLists.length > 0) {
          const firstListChildren = nestedLists[0]?.getChildren?.() ?? [];
          const hasListItem = firstListChildren.some(
            (child: any) => typeof child.getType === 'function' && child.getType() === 'listitem'
          );

          if (!hasListItem) {
            throw new Error('Invalid outline structure: list wrapper without list item child');
          }
        }

        const indent = typeof item.getIndent === 'function' ? item.getIndent() : 0;
        const contentNodes = children.filter(
          (child: any) => typeof child.getType === 'function' && child.getType() !== 'list'
        );
        const text = contentNodes
          .map((child: any) => child?.getTextContent?.() ?? '')
          .join('')
          .trim();

        flat.push({ text, indent });

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

      const parentIndent = stack[stack.length - 1]!.indent;
      if (indent > parentIndent + 1) {
        throw new Error(
          `Invalid outline structure: indent jumped from ${parentIndent} to ${indent} for "${text}"`
        );
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
}
