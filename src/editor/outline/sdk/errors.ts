import type { NoteId } from './contracts';

export class NoteNotFoundError extends Error {
  readonly noteId: NoteId;

  constructor(noteId: NoteId) {
    super(`Note not found: ${noteId}`);
    this.name = 'NoteNotFoundError';
    this.noteId = noteId;
  }
}
