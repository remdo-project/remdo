import { IneligibleOperationError, NoteUnavailableError } from '#note-sdk';
import { AuthorizationError } from '#platform/net/authorization-error';
import { CollaborationUnavailableError, DocumentAccessDeniedError } from '#platform/net/collaboration-errors';
import { UnconfirmedWriteError } from '../headless/unconfirmed-write-error';

export const ERROR_CODES = [
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'UNAVAILABLE',
  'OUTCOME_UNCONFIRMED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const UNAVAILABLE = 'RemDo is unavailable. Try again later.';
export const RECONNECT = 'RemDo no longer accepts this authorization. Reconnect RemDo.';
export const DOCUMENT_NOT_FOUND = 'The document is not available. Check list_documents for the documents the user can access.';

export class ToolError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Unavailable and inaccessible documents share one message so neither reveals which it was.
export function describeFailure(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof ToolError) return { code: error.code, message: error.message };
  if (error instanceof UnconfirmedWriteError) return { code: 'OUTCOME_UNCONFIRMED', message: error.message };
  if (error instanceof AuthorizationError) return { code: 'UNAUTHENTICATED', message: RECONNECT };
  if (error instanceof DocumentAccessDeniedError) return { code: 'NOT_FOUND', message: DOCUMENT_NOT_FOUND };
  if (error instanceof NoteUnavailableError) {
    return { code: 'NOT_FOUND', message: `${error.message} Read the document for its current notes.` };
  }
  if (error instanceof IneligibleOperationError) return { code: 'INVALID_ARGUMENT', message: error.message };
  if (error instanceof CollaborationUnavailableError) return { code: 'UNAVAILABLE', message: UNAVAILABLE };
  return { code: 'INTERNAL', message: error instanceof Error ? error.message : 'The operation failed.' };
}
