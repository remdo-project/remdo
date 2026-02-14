import type { ListItemNode } from '@lexical/list';
import { $getNearestNodeFromDOMNode } from 'lexical';
import type { LexicalNode } from 'lexical';

import {
  $requireContentItemNoteId,
  resolveContentItemFromNode,
} from './schema';

export function $resolveContentNoteFromDOMNode(node: Node | null): ListItemNode | null {
  if (!node) {
    return null;
  }
  return resolveContentItemFromNode($getNearestNodeFromDOMNode(node));
}

export function $resolveNoteIdFromNode(node: LexicalNode | null): string | null {
  const contentItem = resolveContentItemFromNode(node);
  if (!contentItem) {
    return null;
  }
  return $requireContentItemNoteId(contentItem);
}

export function $resolveNoteIdFromDOMNode(node: Node | null): string | null {
  if (!node) {
    return null;
  }
  return $resolveNoteIdFromNode($getNearestNodeFromDOMNode(node));
}
