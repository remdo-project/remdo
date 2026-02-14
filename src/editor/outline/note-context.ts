import type { ListItemNode } from '@lexical/list';
import { $getNearestNodeFromDOMNode } from 'lexical';
import type { LexicalNode } from 'lexical';

import { $getNoteId } from '#lib/editor/note-id-state';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from './list-structure';

export function $resolveContentNoteFromNode(node: LexicalNode | null): ListItemNode | null {
  const listItem = findNearestListItem(node);
  if (!listItem) {
    return null;
  }

  const contentItem = getContentListItem(listItem);
  return isChildrenWrapper(contentItem) ? null : contentItem;
}

export function $resolveContentNoteFromDOMNode(node: Node | null): ListItemNode | null {
  if (!node) {
    return null;
  }
  return $resolveContentNoteFromNode($getNearestNodeFromDOMNode(node));
}

export function $resolveNoteIdFromNode(node: LexicalNode | null): string | null {
  const contentItem = $resolveContentNoteFromNode(node);
  if (!contentItem) {
    return null;
  }
  return $getNoteId(contentItem) ?? null;
}

export function $resolveNoteIdFromDOMNode(node: Node | null): string | null {
  if (!node) {
    return null;
  }
  return $resolveNoteIdFromNode($getNearestNodeFromDOMNode(node));
}
