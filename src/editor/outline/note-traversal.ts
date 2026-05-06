import type { ListItemNode } from '@lexical/list';
import { $requireContentItemNoteId, $requireRootContentList } from './schema';
import { forEachContentItemInOutline } from './list-traversal';
import { getParentContentItem } from './selection/tree';
import { getNoteOwnText } from './selection/note-body';

export interface NotePathItem {
  noteId: string;
  label: string;
}

export function areNotePathsEqual(next: NotePathItem[], prev: NotePathItem[] | null): boolean {
  if (!prev || next.length !== prev.length) {
    return false;
  }
  return next.every((item, index) => item.noteId === prev[index]!.noteId && item.label === prev[index]!.label);
}

// Current implementation scans the outline.
// Planned direction: indexed note lookup so SDK handle reads built on top of
// this path become cheap enough for consumers like search to treat note access
// as effectively O(1).
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
    path.push({ noteId, label: getNoteOwnText(current) });
    current = getParentContentItem(current);
  }

  return path.toReversed();
}
