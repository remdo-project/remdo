import type { ListItemNode } from '@lexical/list';
import type { NoteId, NoteRange } from './sdk/contracts';
import { $requireContentItemNoteId } from './schema';
import { sortHeadsByDocumentOrder } from './selection/tree';

export function noteRangeFromNoteId(noteId: NoteId): NoteRange {
  return { start: noteId, end: noteId };
}

export function noteRangeFromOrderedIds(noteIds: readonly NoteId[]): NoteRange | null {
  const start = noteIds[0];
  const end = noteIds.at(-1);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

export function $noteRangeFromOrderedNotes(notes: readonly ListItemNode[]): NoteRange | null {
  const start = notes[0];
  const end = notes.at(-1);
  if (!start || !end) {
    return null;
  }
  return {
    start: $requireContentItemNoteId(start),
    end: $requireContentItemNoteId(end),
  };
}

export function $noteRangeFromNotesByDocumentOrder(notes: readonly ListItemNode[]): NoteRange | null {
  if (notes.length === 0) {
    return null;
  }
  return $noteRangeFromOrderedNotes(sortHeadsByDocumentOrder([...notes]));
}
