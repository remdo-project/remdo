import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { $getRoot } from 'lexical';
import type { LexicalNode } from 'lexical';

import { $getNoteId } from '#lib/editor/note-id-state';
import { reportInvariant } from '@/editor/invariant';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from './list-structure';

function failOutlineInvariant(message: string, context: Record<string, unknown>): never {
  reportInvariant({ message, context });
  throw new Error(`Outline schema invariant: ${message}`);
}

export function $requireRootContentList(): ListNode {
  const list = $resolveRootContentList();
  if (list) {
    return list;
  }
  const root = $getRoot();
  const children = root.getChildren();
  failOutlineInvariant('Root must contain exactly one top-level list node', {
    rootChildTypes: children.map((child) => child.getType()),
    rootChildrenSize: children.length,
  });
}

function $resolveRootContentList(): ListNode | null {
  const root = $getRoot();
  const children = root.getChildren();
  const firstChild = children[0] ?? null;
  if (!$isListNode(firstChild) || children.length !== 1) {
    return null;
  }
  return firstChild;
}

export function $resolveContentItemFromNode(node: LexicalNode | null): ListItemNode | null {
  const listItem = findNearestListItem(node);
  if (!listItem) {
    return null;
  }
  const contentItem = getContentListItem(listItem);
  return isChildrenWrapper(contentItem) ? null : contentItem;
}

export function $requireContentItem(item: ListItemNode): ListItemNode {
  const contentItem = getContentListItem(item);
  if (isChildrenWrapper(contentItem)) {
    failOutlineInvariant('Expected content list item, received malformed wrapper chain', {
      itemKey: item.getKey(),
      itemType: item.getType(),
    });
  }
  return contentItem;
}

export function $requireContentItemFromNode(node: LexicalNode | null): ListItemNode {
  if (!node) {
    failOutlineInvariant('Expected lexical node while resolving content list item', {
      node: null,
    });
  }

  const listItem = findNearestListItem(node);
  if (!listItem) {
    failOutlineInvariant('Expected list item ancestor while resolving content list item', {
      nodeType: node.getType(),
      nodeKey: node.getKey(),
    });
  }

  return $requireContentItem(listItem);
}

export function $requireContentItemNoteId(item: ListItemNode): string {
  const noteId = $getNoteId(item);
  if (!noteId) {
    failOutlineInvariant('Expected noteId on content list item', {
      itemKey: item.getKey(),
      itemType: item.getType(),
    });
  }
  return noteId;
}

export function $requireContentItemNoteIdFromNode(node: LexicalNode | null): string {
  const contentItem = $requireContentItemFromNode(node);
  return $requireContentItemNoteId(contentItem);
}
