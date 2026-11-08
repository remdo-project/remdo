import { api, ApiError } from '#platform/http/api-client';
import type { components } from '#platform/http/api-schema';

export type NoteRead = components['schemas']['Note'];
export type NoteOperation = components['schemas']['OperationRequest'];
export type CallResult = components['schemas']['CallResult'];
export type Versions = Record<string, string | null>;

export class NotesRefusal extends Error {
  constructor(readonly code: string, message: string, readonly versions: Versions) {
    super(message);
    this.name = 'NotesRefusal';
  }
}

function refusalOrStatus(error: unknown, response: Response): Error {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const refusal = error as components['schemas']['Refusal'];
    return new NotesRefusal(refusal.code, refusal.message, refusal.versions);
  }
  return new ApiError(response.status);
}

export async function readNote(
  ref: string,
  query: { depth?: number; content?: boolean },
  signal?: AbortSignal,
): Promise<NoteRead> {
  const { data, error, response } = await api.GET('/api/notes/{ref}', {
    params: { path: { ref }, query },
    signal,
  });
  if (data) return data;
  throw refusalOrStatus(error, response);
}

export async function callNotes(operations: NoteOperation[], expected: Versions = {}): Promise<CallResult> {
  const { data, error, response } = await api.POST('/api/notes', { body: { operations, expected, dryRun: false } });
  if (data) return data;
  throw refusalOrStatus(error, response);
}
