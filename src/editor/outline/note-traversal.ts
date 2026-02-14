import type { ListItemNode, ListNode } from '@lexical/list';
import { $requireContentItemNoteId, $requireRootContentList } from './schema';
import { isChildrenWrapper } from './list-structure';
import { getNestedList, getParentContentItem } from './selection/tree';

export interface NotePathItem {
  noteId: string;
  label: string;
}

export function $findNoteById(noteId: string): ListItemNode | null {
  const list = $requireRootContentList();

  const visit = (listNode: ListNode): ListItemNode | null => {
    for (const child of listNode.getChildren()) {
      const item = child as ListItemNode;
      if (isChildrenWrapper(item)) {
        continue;
      }

      if ($requireContentItemNoteId(item) === noteId) {
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
    const noteId = $requireContentItemNoteId(current);
    path.push({ noteId, label: current.getTextContent() });
    current = getParentContentItem(current);
  }

  return path.toReversed();
}
