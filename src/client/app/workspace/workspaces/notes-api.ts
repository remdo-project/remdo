import { api, requireData } from '#platform/http/api-client';
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

function dataOrRefusal<T>(result: { data?: T; error?: unknown; response: Response }): T {
  const { error } = result;
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const refusal = error as components['schemas']['Refusal'];
    throw new NotesRefusal(refusal.code, refusal.message, refusal.versions);
  }
  return requireData(result);
}

export async function readNote(
  ref: string,
  query: { depth?: number; content?: boolean },
  signal?: AbortSignal,
): Promise<NoteRead> {
  return dataOrRefusal(await api.GET('/api/notes/{ref}', { params: { path: { ref }, query }, signal }));
}

export async function callNotes(operations: NoteOperation[], expected: Versions = {}): Promise<CallResult> {
  return dataOrRefusal(await api.POST('/api/notes', { body: { operations, expected, dryRun: false } }));
}
