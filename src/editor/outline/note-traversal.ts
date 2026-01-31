import type { ListItemNode, ListNode } from '@lexical/list';
import { $getRoot } from 'lexical';
import { $getNoteId } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from './list-structure';
import { getNestedList, getParentContentItem } from './selection/tree';

export interface NotePathItem {
  noteId: string;
  label: string;
}

export function $findNoteById(noteId: string): ListItemNode | null {
  const root = $getRoot();
  const list = root.getFirstChild<ListNode>()!;

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
