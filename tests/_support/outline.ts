import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

export interface OutlineNode {
  text?: string;
  children?: Outline;
}

export type Outline = OutlineNode[];

type NodeWithChildren = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
};

interface BuildNode {
  text: string | null;
  children: BuildNode[];
}

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

interface FlatOutlineEntry {
  text: string | null;
  indent: number;
}

function normalizeOutline(nodes: BuildNode[]): Outline {
  return nodes.map((node): OutlineNode => {
    const normalizedChildren = normalizeOutline(node.children);
    const normalized: OutlineNode = {};

    if (node.text !== null) {
      normalized.text = node.text;
    }

    if (normalizedChildren.length > 0) {
      normalized.children = normalizedChildren;
    }

    return normalized;
  });
}

export function extractOutlineFromEditorState(state: unknown): Outline {
  const root = (state as SerializedEditorState | null | undefined)?.root;
  if (!root || root.type !== 'root') {
    throw new TypeError('Expected a Lexical SerializedEditorState with root.type === "root".');
  }

  const listNode = getChildren(root).find((child) => isNodeWithChildren(child) && child.type === 'list');
  if (!listNode) {
    return [];
  }

  const flat: FlatOutlineEntry[] = [];

  const collectItems = (list: SerializedLexicalNode) => {
    if (!isNodeWithChildren(list) || list.type !== 'list') {
      return;
    }

    for (const child of getChildren(list)) {
      if (!isNodeWithChildren(child) || child.type !== 'listitem') {
        continue;
      }

      if (isChildrenWrapperListItem(child)) {
        const nested = getChildren(child)[0];
        if (nested) {
          collectItems(nested);
        }
        continue;
      }

      const children = getChildren(child);
      const nestedLists = children.filter((node) => node.type === 'list');
      const contentNodes = children.filter((node) => node.type !== 'list');

      const indentValue = (child as { indent?: unknown }).indent;
      const indent = typeof indentValue === 'number' ? indentValue : 0;

      const text = contentNodes.length > 0 ? contentNodes.map(collectTextContent).join('') : null;

      flat.push({ text, indent });

      for (const nested of nestedLists) {
        collectItems(nested);
      }
    }
  };

  collectItems(listNode);

  const rawOutline: BuildNode[] = [];
  const stack: Array<{ indent: number; children: BuildNode[] }> = [{ indent: -1, children: rawOutline }];

  for (const { text, indent } of flat) {
    const node: BuildNode = { text, children: [] };

    while (stack.length > 0 && stack.at(-1)!.indent >= indent) {
      stack.pop();
    }

    stack.at(-1)!.children.push(node);
    stack.push({ indent, children: node.children });
  }

  return normalizeOutline(rawOutline);
}
