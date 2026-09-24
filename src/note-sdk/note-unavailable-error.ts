import type { NoteId } from './notes';

/** The addressed note cannot be read because it or its source is unavailable. */
export class NoteUnavailableError extends Error {
  readonly noteId: NoteId;

  constructor(noteId: NoteId) {
    super(`Note "${noteId}" is not available.`);
    this.name = 'NoteUnavailableError';
    this.noteId = noteId;
  }
}
