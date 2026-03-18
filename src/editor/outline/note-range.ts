import type { NoteRange } from '@/editor/notes/sdk-contracts';
import type { NoteId } from '@/notes/contracts';

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
