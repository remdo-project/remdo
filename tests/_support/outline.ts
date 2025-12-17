import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

export interface OutlineNode {
  text?: string;
  children?: Outline;
}

export type Outline = OutlineNode[];

type NodeWithChildren = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
};

function isNodeWithChildren(node: SerializedLexicalNode | null | undefined): node is NodeWithChildren {
  return Boolean(node && (node as NodeWithChildren).children !== undefined);
}

function getChildren(node: SerializedLexicalNode | null | undefined): SerializedLexicalNode[] {
  if (!isNodeWithChildren(node)) {
    return [];
  }
  const { children } = node;
  return Array.isArray(children) ? children : [];
}

function collectTextContent(node: SerializedLexicalNode | null | undefined): string {
  if (!node) return '';

  const maybeText: unknown = (node as { text?: unknown }).text;
  const text = typeof maybeText === 'string' ? maybeText : '';
  const childrenText = getChildren(node).map(collectTextContent).join('');

  return text + childrenText;
}

function isChildrenWrapperListItem(node: SerializedLexicalNode | null | undefined): boolean {
  if (!isNodeWithChildren(node) || node.type !== 'listitem') {
    return false;
  }

  const children = getChildren(node);
  return children.length === 1 && children[0]?.type === 'list';
}

export function extractOutlineFromEditorState(state: unknown): Outline {
  /**
   * Lexical represents each conceptual note with a content list item (holding the inline
   * nodes) optionally followed by a wrapper list item that contains a nested list for the
   * note's children. Wrapper items never include inline content. We only want to surface
   * the content-bearing items in outlines so every entry corresponds to exactly one note.
   */
  const root = (state as SerializedEditorState | null | undefined)?.root;
  if (!root || root.type !== 'root') {
    throw new TypeError('Expected a Lexical SerializedEditorState with root.type === "root".');
  }

  const listNode = getChildren(root).find((child) => isNodeWithChildren(child) && child.type === 'list');
  if (!listNode) {
    return [];
  }

  const readList = (list: SerializedLexicalNode): Outline => {
    if (!isNodeWithChildren(list) || list.type !== 'list') {
      return [];
    }

    const items = getChildren(list);
    const outline: Outline = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!isNodeWithChildren(item) || item.type !== 'listitem') {
        continue;
      }

      if (isChildrenWrapperListItem(item)) {
        continue;
      }

      const children = getChildren(item);
      const contentNodes = children.filter((node) => node.type !== 'list');
      const text = contentNodes.length > 0 ? contentNodes.map(collectTextContent).join('') : null;

      let nestedList: SerializedLexicalNode | null = null;
      const nextItem = items[index + 1];
      if (isChildrenWrapperListItem(nextItem)) {
        nestedList = getChildren(nextItem)[0] ?? null;
        index += 1;
      } else {
        nestedList = children.find((node) => node.type === 'list') ?? null;
      }

      const node: OutlineNode = {};
      if (text !== null) {
        node.text = text;
      }

      if (nestedList) {
        const nested = readList(nestedList);
        if (nested.length > 0) {
          node.children = nested;
        }
      }

      outline.push(node);
    }

    return outline;
  };

  return readList(listNode);
}
