import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

type NodeWithChildren = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
};

export interface FlatOutlineEntry {
  text: string;
  indent: number;
}

const LIST_TYPE = 'list';
const LIST_ITEM_TYPE = 'listitem';
const ROOT_TYPE = 'root';

function isNodeWithChildren(node: SerializedLexicalNode | undefined | null): node is NodeWithChildren {
  return Boolean(node && typeof (node as NodeWithChildren).children !== 'undefined');
}

function getChildren(node: SerializedLexicalNode | undefined | null): SerializedLexicalNode[] {
  if (!isNodeWithChildren(node)) {
    return [];
  }

  const { children } = node;
  return Array.isArray(children) ? children : [];
}

function collectTextContent(node: SerializedLexicalNode | undefined | null): string {
  if (!node) return '';

  const maybeText: unknown = (node as { text?: unknown }).text;
  const text = typeof maybeText === 'string' ? maybeText : '';
  const childrenText = getChildren(node).map(collectTextContent).join('');

  return text + childrenText;
}

function visitList(listNode: NodeWithChildren, entries: FlatOutlineEntry[]): void {
  const children = getChildren(listNode);
  let previousListItem: SerializedLexicalNode | undefined;

  children.forEach((child) => {
    if (!isNodeWithChildren(child) || child.type !== LIST_ITEM_TYPE) {
      return;
    }

    const childChildren = getChildren(child);
    const nestedLists = childChildren.filter((nested) => nested.type === LIST_TYPE);
    const contentNodes = childChildren.filter((nested) => nested.type !== LIST_TYPE);

    if (nestedLists.length > 0 && contentNodes.length === 0) {
      if (!previousListItem || previousListItem.type !== LIST_ITEM_TYPE) {
        throw new Error('Invalid outline structure: wrapper list item without preceding list item sibling');
      }
    }

    if (nestedLists.length > 0) {
      const firstListChildren = getChildren(nestedLists[0]);
      const hasListItem = firstListChildren.some((item) => item.type === LIST_ITEM_TYPE);
      if (!hasListItem) {
        throw new Error('Invalid outline structure: list wrapper without list item child');
      }
    }

    const indentValue = (child as { indent?: unknown }).indent;
    const indent = typeof indentValue === 'number' ? indentValue : 0;
    const text = contentNodes.map(collectTextContent).join('').trim();

    entries.push({ text, indent });

    nestedLists.forEach((nested) => {
      if (isNodeWithChildren(nested)) {
        visitList(nested, entries);
      }
    });

    previousListItem = child;
  });
}

export function collectOutlineEntries(state: SerializedEditorState): FlatOutlineEntry[] {
  const entries: FlatOutlineEntry[] = [];
  const root = state.root;

  if (!root || root.type !== ROOT_TYPE) {
    return entries;
  }

  const rootChildren = getChildren(root);
  const listNode = rootChildren.find(
    (child): child is NodeWithChildren => isNodeWithChildren(child) && child.type === LIST_TYPE
  );

  if (!listNode) {
    return entries;
  }

  visitList(listNode, entries);

  return entries;
}

export function assertEditorSchema(state: SerializedEditorState): void {
  const entries = collectOutlineEntries(state);

  const stack: Array<{ indent: number }> = [{ indent: -1 }];

  for (const entry of entries) {
    if (!entry.text) {
      continue;
    }

    const parentIndent = stack[stack.length - 1]!.indent;
    if (entry.indent > parentIndent + 1) {
      throw new Error(
        `Invalid outline structure: indent jumped from ${parentIndent} to ${entry.indent} for "${entry.text}"`
      );
    }

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= entry.indent) {
      stack.pop();
    }

    stack.push({ indent: entry.indent });
  }
}
