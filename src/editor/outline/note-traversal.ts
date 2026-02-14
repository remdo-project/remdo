import type { ListItemNode } from '@lexical/list';
import { $requireContentItemNoteId, $requireRootContentList } from './schema';
import { forEachContentItemInOutline } from './list-traversal';
import { getParentContentItem } from './selection/tree';

export interface NotePathItem {
  noteId: string;
  label: string;
}

export function $findNoteById(noteId: string): ListItemNode | null {
  const list = $requireRootContentList();
  let match: ListItemNode | null = null;
  forEachContentItemInOutline(list, (item) => {
    if ($requireContentItemNoteId(item) !== noteId) {
      return;
    }

    match = item;
    return false;
  });
  return match;
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
