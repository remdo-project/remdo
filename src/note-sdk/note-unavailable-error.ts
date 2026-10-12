import { IneligibleOperationError } from './ineligible-operation-error';
import type { NoteId } from './notes';

/** The addressed note cannot be read or operated on because it or its source is unavailable. */
export class NoteUnavailableError extends IneligibleOperationError {
  readonly noteId: NoteId;

  constructor(noteId: NoteId) {
    super(`Note "${noteId}" is not available.`);
    this.name = 'NoteUnavailableError';
    this.noteId = noteId;
  }
}
