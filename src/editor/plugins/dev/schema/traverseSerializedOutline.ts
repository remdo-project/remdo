import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { reportInvariant } from '@/editor/invariant';

interface NodeWithChildren extends SerializedLexicalNode {
  children?: SerializedLexicalNode[];
}

export interface SerializedOutlineNote {
  indent: number;
  path: number[];
  noteId: string;
  folded?: boolean;
  checked?: boolean;
  contentNodes: SerializedLexicalNode[];
  children: SerializedOutlineNote[];
}

interface TraversalResult {
  notes: SerializedOutlineNote[];
  valid: boolean;
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

function formatPath(path: number[]): string {
  return path.length === 0 ? 'root' : path.join('.');
}

export function traverseSerializedOutline(state: SerializedEditorState): TraversalResult {
  let valid = true;

  const fail = (message: string, context?: Record<string, unknown>): void => {
    valid = false;
    reportInvariant({ message, context });
  };

  const readWrapperNestedList = (wrapper: NodeWithChildren, contextPath: number[]): NodeWithChildren | null => {
    if (!valid) {
      return null;
    }

    const pathStr = formatPath(contextPath);
    const wrapperChildren = getChildren(wrapper);
    const nestedLists = wrapperChildren.filter((child) => child.type === LIST_TYPE);
    const contentNodes = wrapperChildren.filter((child) => child.type !== LIST_TYPE);

    if (nestedLists.length !== 1 || contentNodes.length > 0) {
      fail(
        `wrapper-list-item-invalid path=${pathStr} nestedCount=${nestedLists.length} contentCount=${contentNodes.length}`
      );
      return null;
    }

    const nested = nestedLists[0];
    if (!nested || !isNodeWithChildren(nested)) {
      fail(`wrapper-list-item-list-invalid path=${pathStr}`);
      return null;
    }

    const nestedChildren = getChildren(nested);
    const hasListItem = nestedChildren.some((item) => item.type === LIST_ITEM_TYPE);
    if (!hasListItem) {
      fail(`list-wrapper-no-listitem path=${pathStr}`);
      return null;
    }

    return nested;
  };

  const readList = (
    listNode: NodeWithChildren,
    usedNoteIds: Set<string>,
    prefix: number[] = []
  ): SerializedOutlineNote[] => {
    if (!valid) {
      return [];
    }

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

      if (nestedLists.length > 0 && contentNodes.length === 0) {
        const prefixStr = formatPath(prefix);
      fail(`wrapper-without-sibling path=${prefixStr}`);
      break;
    }

      const indentValue = (child as { indent?: unknown }).indent;
      const indent = typeof indentValue === 'number' ? indentValue : 0;
      const path = [...prefix, noteIndex];
      noteIndex += 1;

      if (nestedLists.length > 0) {
        const pathStr = formatPath(path);
      fail(`content-item-has-nested-list path=${pathStr} nestedCount=${nestedLists.length}`);
      break;
    }

      const noteIdValue = (child as { noteId?: unknown }).noteId;
      if (typeof noteIdValue !== 'string' || noteIdValue.length === 0) {
        const pathStr = formatPath(path);
      fail(`missing-note-id path=${pathStr} noteId=${String(noteIdValue)}`);
      break;
    }

      const noteId = noteIdValue;
      if (usedNoteIds.has(noteId)) {
        const pathStr = formatPath(path);
      fail(`duplicate-note-id path=${pathStr} noteId=${noteId}`);
      break;
    }
      usedNoteIds.add(noteId);
      const foldedValue = (child as { folded?: unknown }).folded;
      const checkedValue = (child as { checkState?: unknown }).checkState;
      const note: SerializedOutlineNote = {
        indent,
        path,
        noteId,
        folded: foldedValue === true ? true : undefined,
        checked: checkedValue === true ? true : undefined,
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
            const pathStr = formatPath(path);
          fail(`multiple-nested-lists path=${pathStr} nestedCount=${nextNestedLists.length}`);
          break;
        }

          const nested = readWrapperNestedList(nextSibling, path);
          if (!nested) {
            break;
          }
          note.children = readList(nested, usedNoteIds, path);
          index += 1;
        }
      }

      notes.push(note);
    }

    return notes;
  };

  const root = state.root;
  if (root.type !== ROOT_TYPE) {
    return { notes: [], valid: true };
  }

  const rootChildren = getChildren(root);
  const listNode = rootChildren.find((child): child is NodeWithChildren => isNodeWithChildren(child) && child.type === LIST_TYPE);
  if (!listNode) {
    return { notes: [], valid: true };
  }

  const usedNoteIds = new Set<string>();
  const notes = readList(listNode, usedNoteIds);
  return { notes, valid };
}
