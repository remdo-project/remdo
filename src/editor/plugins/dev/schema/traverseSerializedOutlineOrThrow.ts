import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { reportInvariant } from '@/editor/invariant';

type NodeWithChildren = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
};

export interface SerializedOutlineNote {
  indent: number;
  path: number[];
  contentNodes: SerializedLexicalNode[];
  children: SerializedOutlineNote[];
}

const LIST_TYPE = 'list';
const LIST_ITEM_TYPE = 'listitem';
const ROOT_TYPE = 'root';

function fail(message: string, context?: Record<string, unknown>): never {
  // `reportInvariant` throws in dev/test; the `throw` is only for TS control-flow.
  reportInvariant({ message, context });
  throw new Error('unreachable: reportInvariant should have thrown');
}

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

function formatPath(path: number[]): string {
  return path.join('.');
}

function assertNestedListHasListItem(nestedList: NodeWithChildren): void {
  const nestedChildren = getChildren(nestedList);
  const hasListItem = nestedChildren.some((item) => item.type === LIST_ITEM_TYPE);
  if (!hasListItem) {
    fail('Invalid outline structure: list wrapper without list item child', { nestedCount: 1 });
  }
}

function readWrapperNestedListOrThrow(wrapper: NodeWithChildren, contextPath: number[]): NodeWithChildren {
  const wrapperChildren = getChildren(wrapper);
  const nestedLists = wrapperChildren.filter((child) => child.type === LIST_TYPE);
  const contentNodes = wrapperChildren.filter((child) => child.type !== LIST_TYPE);

  if (nestedLists.length !== 1 || contentNodes.length > 0) {
    fail(`Invalid outline structure: wrapper list item must contain exactly one list at "${formatPath(contextPath)}"`, {
      nestedCount: nestedLists.length,
      contentCount: contentNodes.length,
      path: formatPath(contextPath),
    });
  }

  const nested = nestedLists[0];
  if (!nested || !isNodeWithChildren(nested)) {
    fail(`Invalid outline structure: wrapper list item list is not serializable at "${formatPath(contextPath)}"`, {
      path: formatPath(contextPath),
    });
  }

  assertNestedListHasListItem(nested);
  return nested;
}

function assertContentItemHasNoEmbeddedLists(contentItem: NodeWithChildren, path: number[]): void {
  const childLists = getChildren(contentItem).filter((child) => child.type === LIST_TYPE);
  if (childLists.length > 0) {
    fail(`Invalid outline structure: embedded nested list in content item at "${formatPath(path)}"`, {
      nestedCount: childLists.length,
      path: formatPath(path),
    });
  }
}

function readListOrThrow(listNode: NodeWithChildren, prefix: number[] = []): SerializedOutlineNote[] {
  const children = getChildren(listNode);
  const notes: SerializedOutlineNote[] = [];
  let noteIndex = 0;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!isNodeWithChildren(child) || child.type !== LIST_ITEM_TYPE) {
      continue;
    }

    const childChildren = getChildren(child);
    const nestedLists = childChildren.filter((nested) => nested.type === LIST_TYPE);
    const contentNodes = childChildren.filter((nested) => nested.type !== LIST_TYPE);
    const isWrapper = nestedLists.length > 0 && contentNodes.length === 0;

    if (isWrapper) {
      fail(`Invalid outline structure: wrapper list item without preceding list item sibling at "${formatPath(prefix)}"`, {
        path: formatPath(prefix),
      });
    }

    const indentValue = (child as { indent?: unknown }).indent;
    const indent = typeof indentValue === 'number' ? indentValue : 0;
    const path = [...prefix, noteIndex];
    noteIndex += 1;

    assertContentItemHasNoEmbeddedLists(child, path);

    const note: SerializedOutlineNote = {
      indent,
      path,
      contentNodes,
      children: [],
    };

    const nextSibling = children[index + 1];
    if (isNodeWithChildren(nextSibling) && nextSibling.type === LIST_ITEM_TYPE) {
      const nextChildren = getChildren(nextSibling);
      const nextNestedLists = nextChildren.filter((nested) => nested.type === LIST_TYPE);
      const nextContentNodes = nextChildren.filter((nested) => nested.type !== LIST_TYPE);
      const nextIsWrapper = nextNestedLists.length > 0 && nextContentNodes.length === 0;

      if (nextIsWrapper) {
        if (nextNestedLists.length !== 1) {
          fail(`Invalid outline structure: multiple nested lists for note at "${formatPath(path)}"`, {
            nestedCount: nextNestedLists.length,
            path: formatPath(path),
          });
        }

        const nested = readWrapperNestedListOrThrow(nextSibling, path);
        note.children = readListOrThrow(nested, path);
        index += 1;
      }
    }

    notes.push(note);
  }

  return notes;
}

export function traverseSerializedOutlineOrThrow(state: SerializedEditorState): SerializedOutlineNote[] {
  const root = state.root;
  if (root.type !== ROOT_TYPE) {
    return [];
  }

  const rootChildren = getChildren(root);
  const listNode = rootChildren.find((child): child is NodeWithChildren => isNodeWithChildren(child) && child.type === LIST_TYPE);
  if (!listNode) {
    return [];
  }

  return readListOrThrow(listNode);
}
