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

// TODO: Replace this outline scan with a shared editor-private noteId-to-NodeKey
// locator so SDK adapters and Lexical features get expected O(1) resolution
// without exposing NodeKeys through the SDK. Remove the fallback once locator
// coverage proves creation, deletion, ID normalization, history/state
// replacement, collaboration, and multiple-editor isolation.
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
