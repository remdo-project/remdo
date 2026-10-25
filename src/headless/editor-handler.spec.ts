import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { IneligibleOperationError, NoteUnavailableError } from '#note-sdk';
import { AuthorizationError } from '#platform/net/authorization-error';
import { CollaborationUnavailableError, DocumentAccessDeniedError } from '#platform/net/collaboration-errors';
import { createEditorHandler } from './editor-handler';
import { withHeadlessOpenDocument } from './open-document';
import { UnconfirmedWriteError } from './unconfirmed-write-error';

vi.mock('./open-document', () => ({ withHeadlessOpenDocument: vi.fn() }));
const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map(stop => stop()));
  vi.resetAllMocks();
});

async function start() {
  const handler = createEditorHandler('https://remdo.example', 1);
  const http = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  stops.push(() => new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())));
  return (body: unknown) => fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/internal/editor`, {
    method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify(body),
  });
}

it.each([
  [new DocumentAccessDeniedError('Denied'), 'NOT_FOUND', 'The document is not available. Check list_documents for the documents the user can access.'],
  [new NoteUnavailableError('note'), 'NOT_FOUND', 'Note "note" is not available. Read the document for its current notes.'],
  [new IneligibleOperationError('Only a note with children has a child list.'), 'INVALID_ARGUMENT', 'Only a note with children has a child list.'],
  [new CollaborationUnavailableError('Lost connection'), 'UNAVAILABLE', 'RemDo is unavailable. Try again later.'],
  [new Error('Unexpected failure.'), 'INTERNAL', 'Unexpected failure.'],
])('preserves editor failure %s across HTTP', async (failure, code, message) => {
  const post = await start();
  vi.mocked(withHeadlessOpenDocument).mockRejectedValueOnce(failure);
  expect(await (await post({ operation: 'read', documentId: 'doc' })).json())
    .toEqual({ error: { code, message, reconnect: false } });
});

it('preserves an unconfirmed outcome and reconnection together', async () => {
  const post = await start();
  vi.mocked(withHeadlessOpenDocument).mockRejectedValueOnce(new UnconfirmedWriteError('Check before retrying.', {
    cause: new AuthorizationError(),
  }));
  expect(await (await post({ operation: 'append', documentId: 'doc', notes: [{ text: 'Note' }] })).json())
    .toEqual({ error: { code: 'OUTCOME_UNCONFIRMED', message: 'Check before retrying.', reconnect: true } });
});

it('refuses invalid or oversized private requests before opening a document and remains available', async () => {
  const post = await start();
  for (const body of [
    { operation: 'read', documentId: '../doc' },
    { operation: 'setChildListType', documentId: 'doc', noteId: 'note', listType: 'unsupported' },
  ]) expect(await (await post(body)).json()).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
  expect((await post({ operation: 'append', documentId: 'doc', notes: [{ text: 'x'.repeat(1024 * 1024) }] })).status).toBe(413);
  expect(await (await post({ operation: 'read', documentId: '../doc' })).json()).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
  expect(withHeadlessOpenDocument).not.toHaveBeenCalled();
});
