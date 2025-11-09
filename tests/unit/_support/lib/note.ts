import type { EditorUpdateOptions } from 'lexical';
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode } from 'lexical';

export interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

export type Outline = OutlineNode[];

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

export function readOutline(validate: <T>(fn: () => T) => T): Outline {
  return validate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) return [] as Outline;

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
        const contentNodes = children.filter(
          (child: any) => typeof child.getType === 'function' && child.getType() !== 'list'
        );

        const indent = typeof item.getIndent === 'function' ? item.getIndent() : 0;
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

    const outline: Outline = [];
    const stack: Array<{ indent: number; children: Outline }> = [{ indent: -1, children: outline }];

    for (const { text, indent } of flat) {
      if (!text) {
        continue;
      }

      const node: OutlineNode = { text, children: [] };
      while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
        stack.pop();
      }

      stack[stack.length - 1]?.children.push(node);
      stack.push({ indent, children: node.children });
    }

    return outline;
  });
}
// TODO: replace this helper with a top-level note selection API once we expose
// proper whole-note selection controls in the editor harness.
export async function selectEntireNote(
  noteText: string,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>
): Promise<void> {
  await placeCaretAtNoteStart(noteText, mutate);

  await mutate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) {
      return;
    }

    const length = anchorNode.getTextContentSize?.() ?? anchorNode.getTextContent().length;
    selection.setTextNodeRange(anchorNode, 0, anchorNode, length);
  });
}

// TODO: replace with a first-class multi-note selection helper when editor UX supports it.
export async function selectNoteRange(
  startNote: string,
  endNote: string,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>
): Promise<void> {
  await selectEntireNote(startNote, mutate);

  if (startNote === endNote) {
    return;
  }

  await mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) {
      throw new Error('Expected root list');
    }

    const endItem = findItemByText(list, endNote);
    if (!endItem) {
      throw new Error(`No list item found with text: ${endNote}`);
    }

    const textNode = endItem
      .getChildren()
      .find(
        (child: any) =>
          typeof child.getType === 'function' &&
          child.getType() !== 'list' &&
          typeof child.getTextContent === 'function'
      );

    if (!textNode || !$isTextNode(textNode)) {
      throw new Error('Expected text node with select capability');
    }

    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const endLength = textNode.getTextContentSize?.() ?? textNode.getTextContent().length;
    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) {
      return;
    }

    selection.setTextNodeRange(anchorNode, 0, textNode, endLength);
  });
}
