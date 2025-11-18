import type { EditorUpdateOptions } from 'lexical';
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
} from 'lexical';

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

/**
 * Positions the caret inside the note whose rendered text matches {@link noteText}.
 *
 * `offset` behaves like a TextNode index with a couple of edge cases worth calling out:
 * - Positive values clamp to the note’s text length, so large numbers (e.g. `Number.POSITIVE_INFINITY`)
 *   jump to the end without needing to know the exact character count.
 * - Negative values are treated as offsets from the end (so `-1` targets the last character).
 * - When no textual child is available, the helper falls back to `selectStart`/`selectEnd` on the list item,
 *   in which case the `offset` is ignored unless selecting the end is explicitly requested via a positive value.
 */
export async function placeCaretAtNote(
  noteText: string,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>,
  offset = 0
) {
  await mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) throw new Error('Expected a list root');

    const item = findItemByText(list, noteText);
    if (!item) throw new Error(`No list item found with text: ${noteText}`);

    const children = item.getChildren();
    const textNode = children.find((child: any) =>
      typeof child.getType === 'function' && child.getType() === 'text'
    );

    if (textNode && typeof textNode.select === 'function') {
      const length = textNode.getTextContentSize?.() ?? textNode.getTextContent().length;
      const normalized = offset < 0 ? length + offset : offset;
      const clamped = Math.max(0, Math.min(length, normalized));
      textNode.select(clamped, clamped);
      return;
    }

    if (offset <= 0 && typeof item.selectStart === 'function') {
      item.selectStart();
      return;
    }

    if (typeof item.selectEnd === 'function') {
      item.selectEnd();
      return;
    }

    throw new TypeError('Expected note to expose caret selection controls');
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
      while (stack.length > 0 && stack.at(-1)!.indent >= indent) {
        stack.pop();
      }

      stack.at(-1)?.children.push(node);
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
  await placeCaretAtNote(noteText, mutate);

  await mutate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) {
      return;
    }

    const length = anchorNode.getTextContentSize();
    selection.setTextNodeRange(anchorNode, 0, anchorNode, length);
  });
}

function getNodePath(node: any): number[] {
  const path: number[] = [];
  let current: any = node;

  while (current) {
    const parent = typeof current.getParent === 'function' ? current.getParent() : null;
    if (!parent || typeof current.getIndexWithinParent !== 'function') {
      break;
    }
    path.push(current.getIndexWithinParent());
    current = parent;
  }

  return path.toReversed();
}

function compareNodeOrder(a: any, b: any): number {
  const aPath = getNodePath(a);
  const bPath = getNodePath(b);
  const depth = Math.max(aPath.length, bPath.length);

  for (let i = 0; i < depth; i++) {
    const left = aPath[i] ?? -1;
    const right = bPath[i] ?? -1;
    if (left !== right) {
      return left - right;
    }
  }

  return 0;
}

function findContentTextNode(item: any) {
  return item
    .getChildren()
    .find(
      (child: any) =>
        typeof child.getType === 'function' &&
        child.getType() !== 'list' &&
        typeof child.getTextContent === 'function'
    );
}

// TODO: replace with a first-class multi-note selection helper when editor UX supports it.
export async function selectNoteRange(
  startNote: string,
  endNote: string,
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>
): Promise<void> {
  if (startNote === endNote) {
    await selectEntireNote(startNote, mutate);
    return;
  }

  await mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list) {
      throw new Error('Expected root list');
    }

    const startItem = findItemByText(list, startNote);
    if (!startItem) {
      throw new Error(`No list item found with text: ${startNote}`);
    }

    const endItem = findItemByText(list, endNote);
    if (!endItem) {
      throw new Error(`No list item found with text: ${endNote}`);
    }

    const startTextNode = findContentTextNode(startItem);
    const endTextNode = findContentTextNode(endItem);

    if (!startTextNode || !$isTextNode(startTextNode)) {
      throw new Error('Expected start text node with select capability');
    }
    if (!endTextNode || !$isTextNode(endTextNode)) {
      throw new Error('Expected end text node with select capability');
    }

    let selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      selection = $createRangeSelection();
      $setSelection(selection);
    }
    if (!$isRangeSelection(selection)) {
      return;
    }

    const rangeSelection = selection;
    const startLength = startTextNode.getTextContentSize();
    const endLength = endTextNode.getTextContentSize();

    const order = compareNodeOrder(startItem, endItem);
    if (order <= 0) {
      rangeSelection.setTextNodeRange(startTextNode, 0, endTextNode, endLength);
    } else {
      rangeSelection.setTextNodeRange(startTextNode, startLength, endTextNode, 0);
    }
  });
}
