import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { $getNearestNodeFromDOMNode, $getRoot } from 'lexical';
import { $getNoteId } from '#lib/editor/note-id-state';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from './list-structure';
import { getNestedList, getParentContentItem } from './selection/tree';

export interface NotePathItem {
  noteId: string;
  label: string;
}

export function $resolveNoteIdFromDOMNode(node: Node | null): string | null {
  if (!node) {
    return null;
  }
  const lexicalNode = $getNearestNodeFromDOMNode(node);
  if (!lexicalNode) {
    return null;
  }
  const listNode = findNearestListItem(lexicalNode);
  if (!listNode || isChildrenWrapper(listNode)) {
    return null;
  }
  const contentItem = getContentListItem(listNode);
  return $getNoteId(contentItem);
}

export function $findNoteById(noteId: string): ListItemNode | null {
  const root = $getRoot();
  const firstChild = root.getFirstChild();
  if (!firstChild || !$isListNode(firstChild)) {
    return null;
  }
  const list = firstChild;

  const visit = (listNode: ListNode): ListItemNode | null => {
    for (const child of listNode.getChildren()) {
      const item = child as ListItemNode;
      if (isChildrenWrapper(item)) {
        continue;
      }

      if ($getNoteId(item) === noteId) {
        return item;
      }

      const nested = getNestedList(item);
      if (nested) {
        const found = visit(nested);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  return visit(list);
}

// Returns the ancestor chain from the document root to the current note (inclusive).
export function $getNoteAncestorPath(target: ListItemNode): NotePathItem[] {
  const path: NotePathItem[] = [];
  let current: ListItemNode | null = target;

  while (current) {
    const noteId = $getNoteId(current);
    if (!noteId) {
      break;
    }
    path.push({ noteId, label: current.getTextContent() });
    current = getParentContentItem(current);
  }

  return path.toReversed();
}
