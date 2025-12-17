import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { reportInvariant } from '@/editor/invariant';

type NodeWithChildren = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
};

export interface FlatOutlineEntry {
  indent: number;
  path: string;
}

const LIST_TYPE = 'list';
const LIST_ITEM_TYPE = 'listitem';
const ROOT_TYPE = 'root';

function isNodeWithChildren(node: SerializedLexicalNode | undefined | null): node is NodeWithChildren {
  return Boolean(node && (node as NodeWithChildren).children !== undefined);
}

function getChildren(node: SerializedLexicalNode | undefined | null): SerializedLexicalNode[] {
  if (!isNodeWithChildren(node)) {
    return [];
  }

  const { children } = node;
  return Array.isArray(children) ? children : [];
}

function isWrapperListItem(contentNodes: SerializedLexicalNode[], nestedLists: SerializedLexicalNode[]): boolean {
  return nestedLists.length > 0 && contentNodes.length === 0;
}

function formatPath(path: number[]): string {
  return path.join('.');
}

function visitList(listNode: NodeWithChildren, entries: FlatOutlineEntry[], prefix: number[] = []): void {
  const children = getChildren(listNode);
  let lastNotePath: number[] | null = null;
  let noteIndex = 0;

  for (const child of children) {
    if (!isNodeWithChildren(child) || child.type !== LIST_ITEM_TYPE) {
      continue;
    }

    const childChildren = getChildren(child);
    const nestedLists = childChildren.filter((nested) => nested.type === LIST_TYPE);
    const contentNodes = childChildren.filter((nested) => nested.type !== LIST_TYPE);

    for (const nested of nestedLists) {
      if (!isNodeWithChildren(nested)) {
        continue;
      }

      const firstListChildren = getChildren(nested);
      const hasListItem = firstListChildren.some((item) => item.type === LIST_ITEM_TYPE);
      if (!hasListItem) {
        reportInvariant({
          message: 'Invalid outline structure: list wrapper without list item child',
          context: { nestedCount: nestedLists.length },
        });
      }
    }

    if (isWrapperListItem(contentNodes, nestedLists)) {
      if (!lastNotePath) {
        reportInvariant({
          message: 'Invalid outline structure: wrapper list item without preceding list item sibling',
          context: { childType: child.type },
        });
      }

      for (const nested of nestedLists) {
        if (!isNodeWithChildren(nested)) {
          continue;
        }

        visitList(nested, entries, lastNotePath ?? prefix);
      }

      continue;
    }

    const indentValue = (child as { indent?: unknown }).indent;
    const indent = typeof indentValue === 'number' ? indentValue : 0;
    const path = [...prefix, noteIndex];
    noteIndex += 1;
    lastNotePath = path;

    entries.push({ indent, path: formatPath(path) });

    for (const nested of nestedLists) {
      if (isNodeWithChildren(nested)) {
        visitList(nested, entries, path);
      }
    }
  }
}

export function collectOutlineEntries(state: SerializedEditorState): FlatOutlineEntry[] {
  const entries: FlatOutlineEntry[] = [];
  const root = state.root;

  if (root.type !== ROOT_TYPE) {
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
    const parentIndent = stack.at(-1)!.indent;
    if (entry.indent > parentIndent + 1) {
      reportInvariant({
        message: `Invalid outline structure: indent jumped from ${parentIndent} to ${entry.indent} at "${entry.path}"`,
        context: { parentIndent, entryIndent: entry.indent, path: entry.path },
      });
    }

    while (stack.length > 0 && stack.at(-1)!.indent >= entry.indent) {
      stack.pop();
    }

    stack.push({ indent: entry.indent });
  }
}
