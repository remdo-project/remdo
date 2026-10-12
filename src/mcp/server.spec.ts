import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { createMcpServer } from './server';
import { withHeadlessOpenDocument } from '../headless/open-document';
import { IneligibleOperationError, NoteUnavailableError } from '#note-sdk';
import { AuthorizationError } from '#platform/net/authorization-error';
import { CollaborationUnavailableError, DocumentAccessDeniedError } from '#platform/net/collaboration-errors';
import { UnconfirmedWriteError } from '../headless/unconfirmed-write-error';

vi.mock('../headless/open-document', () => ({ withHeadlessOpenDocument: vi.fn() }));

const DOCUMENT_NOT_FOUND = 'NOT_FOUND: The document is not available. Check list_documents for the documents the user can access.';

let authorizeStatus: number;
let authorizationChecks: number;
let documentsResponse: { status: number; body: string } | 'dropped';
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  vi.resetAllMocks();
});

async function start() {
  authorizationChecks = 0;
  const django = http.createServer((req, res) => {
    if (req.url === '/api/mcp/current-user') {
      authorizationChecks++;
      res.writeHead(authorizeStatus).end('{}');
    }
    else if (documentsResponse === 'dropped') req.socket.destroy();
    else res.writeHead(documentsResponse.status).end(documentsResponse.body);
  });
  await new Promise<void>((resolve) => django.listen(0, '127.0.0.1', resolve));
  stops.push(() => new Promise((resolve) => django.close(() => resolve())));
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const server = createMcpServer({
    origin,
    apiOrigin: `http://127.0.0.1:${(django.address() as AddressInfo).port}`,
    appOrigin: 'https://remdo.example',
    documentSlots: 1,
  });
  await server.listen();
  stops.push(server.stop);
  return (authorization?: string, body?: unknown) => fetch(new URL('/mcp', origin), {
    method: 'POST',
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(body === undefined ? {} : { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function rpc(post: Awaited<ReturnType<typeof start>>, method: string, params: unknown) {
  const response = await post('Bearer valid', { jsonrpc: '2.0', id: 1, method, params });
  const data = (await response.text()).split('\n').find((line) => line.startsWith('data: '))!;
  return (JSON.parse(data.slice('data: '.length)) as { result: unknown }).result;
}

it('challenges missing and rejected tokens but reports an unavailable RemDo as unavailable', async () => {
  const post = await start();
  const metadata = 'resource_metadata="https://remdo.example/.well-known/oauth-protected-resource/mcp"';

  const missing = await post();
  expect(missing.status).toBe(401);
  expect(missing.headers.get('WWW-Authenticate')).toBe(`Bearer ${metadata}`);

  authorizeStatus = 401;
  const rejected = await post('Bearer stale');
  expect(rejected.status).toBe(401);
  expect(rejected.headers.get('WWW-Authenticate')).toBe(`Bearer ${metadata}, error="invalid_token"`);

  authorizeStatus = 502;
  expect((await post('Bearer valid')).status).toBe(503);

  await stops.shift()!();
  expect((await post('Bearer valid')).status).toBe(503);
});

it('identifies itself with the app icon and tells clients how to use RemDo', async () => {
  const post = await start();
  authorizeStatus = 200;

  const result = await rpc(post, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  }) as { serverInfo: unknown; instructions?: string };
  expect(result.instructions).toContain('outliner');
  expect(result.serverInfo).toMatchObject({
    title: 'RemDo',
    websiteUrl: 'https://remdo.example',
    icons: [
      { src: 'https://remdo.example/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] },
      { src: 'https://remdo.example/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] },
    ],
  });
});

it('declares read-only, destructive, and open-world hints for every tool so clients can gate confirmation', async () => {
  const post = await start();
  authorizeStatus = 200;

  const { tools } = await rpc(post, 'tools/list', {}) as { tools: Array<{ name: string; title?: string; annotations?: object }> };

  expect(Object.fromEntries(tools.map(({ name, title, annotations }) => [name, { title, annotations }]))).toEqual({
    list_documents: {
      title: 'List documents',
      annotations: { title: 'List documents', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    read_document: {
      title: 'Read document',
      annotations: { title: 'Read document', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    create_document: {
      title: 'Create document',
      annotations: { title: 'Create document', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    append_children: {
      title: 'Append notes',
      annotations: { title: 'Append notes', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    rename_document: {
      title: 'Rename document',
      annotations: {
        title: 'Rename document',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    set_child_list_type: {
      title: 'Set list type',
      annotations: {
        title: 'Set list type',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  });
});

it('advertises the OAuth requirement of every tool at the descriptor top level and in _meta', async () => {
  const post = await start();
  authorizeStatus = 200;

  const { tools } = await rpc(post, 'tools/list', {}) as { tools: object[] };

  const securitySchemes = [{ type: 'oauth2', scopes: ['openid'] }];
  expect(tools.length).toBeGreaterThan(0);
  for (const tool of tools) {
    expect(tool).toMatchObject({ securitySchemes, _meta: { securitySchemes } });
  }
});

it('provides a reconnect challenge when authorization expires during a tool call', async () => {
  const post = await start();
  authorizeStatus = 200;
  documentsResponse = { status: 401, body: '' };

  const result = await rpc(post, 'tools/call', { name: 'list_documents', arguments: {} });

  expect(result).toEqual({
    isError: true,
    content: [{ type: 'text', text: 'UNAUTHENTICATED: RemDo no longer accepts this authorization. Reconnect RemDo.' }],
    _meta: {
      'mcp/www_authenticate': [
        'Bearer resource_metadata="https://remdo.example/.well-known/oauth-protected-resource/mcp", '
          + 'error="invalid_token", error_description="Reconnect RemDo."',
      ],
    },
  });
  expect(authorizationChecks).toBe(1);
});

it.each([
  { name: 'a denied document', failure: new DocumentAccessDeniedError('Document access denied.'), text: DOCUMENT_NOT_FOUND },
  {
    name: 'an unavailable note',
    failure: new NoteUnavailableError('note'),
    text: 'NOT_FOUND: Note "note" is not available. Read the document for its current notes.',
  },
  {
    name: 'an ineligible operation',
    failure: new IneligibleOperationError('Only a note with children has a child list.'),
    text: 'INVALID_ARGUMENT: Only a note with children has a child list.',
  },
  {
    name: 'a lost collaboration connection',
    failure: new CollaborationUnavailableError('Failed to connect to collaboration server'),
    text: 'UNAVAILABLE: RemDo is unavailable. Try again later.',
  },
  { name: 'an unexpected error', failure: new Error('Unexpected failure.'), text: 'INTERNAL: Unexpected failure.' },
])('codes $name without a reconnect challenge', async ({ failure, text }) => {
  const post = await start();
  authorizeStatus = 200;
  vi.mocked(withHeadlessOpenDocument).mockRejectedValueOnce(failure);

  const result = await rpc(post, 'tools/call', { name: 'read_document', arguments: { target: 'doc' } });

  expect(result).toEqual({ isError: true, content: [{ type: 'text', text }] });
});

it('codes input the SDK rejects as an invalid argument', async () => {
  const post = await start();
  authorizeStatus = 200;

  const result = await rpc(post, 'tools/call', { name: 'read_document', arguments: { target: 'doc', depth: 0 } });

  expect(result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/^INVALID_ARGUMENT: .*depth/s) as string }] });
  expect(withHeadlessOpenDocument).not.toHaveBeenCalled();
});

it('preserves an unconfirmed write warning when reconnection is also required', async () => {
  const post = await start();
  authorizeStatus = 200;
  const message = 'Document changes are unconfirmed and may still be saved. Check the document before retrying.';
  vi.mocked(withHeadlessOpenDocument).mockRejectedValueOnce(new UnconfirmedWriteError(message, {
    cause: new AuthorizationError('Document access denied.'),
  }));

  const result = await rpc(post, 'tools/call', {
    name: 'append_children', arguments: { parent: 'doc', notes: [{ text: 'Note' }] },
  });

  expect(result).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: `OUTCOME_UNCONFIRMED: ${message}` }],
    _meta: { 'mcp/www_authenticate': [expect.stringContaining('error="invalid_token"')] },
  });
  expect(authorizationChecks).toBe(1);
});

it.each([
  [{ status: 400, body: '{"title":["Invalid title."]}' }, 'INVALID_ARGUMENT: RemDo rejected the request as invalid: {"title":["Invalid title."]}'],
  [{ status: 400, body: '<!doctype html><title>Bad Request</title>' }, 'INVALID_ARGUMENT: RemDo rejected the request as invalid.'],
  [{ status: 403, body: '{}' }, 'PERMISSION_DENIED: The user is not allowed to do this in RemDo.'],
  [{ status: 404, body: '' }, 'INTERNAL: RemDo could not complete the request (404).'],
  [{ status: 413, body: '' }, 'INTERNAL: RemDo could not complete the request (413).'],
  [{ status: 502, body: '' }, 'UNAVAILABLE: RemDo is unavailable. Try again later.'],
  ['dropped' as const, 'OUTCOME_UNCONFIRMED: RemDo did not confirm whether the request took effect. Check with list_documents before retrying.'],
])('reports API outcome %j as a coded tool error', async (outcome, message) => {
  const post = await start();
  authorizeStatus = 200;
  documentsResponse = outcome;

  const result = await rpc(post, 'tools/call', { name: 'create_document', arguments: { title: 'Plan' } });

  expect(result).toEqual({ isError: true, content: [{ type: 'text', text: message }] });
  expect(authorizationChecks).toBe(1);
});

it('reports a document the API cannot find as not found', async () => {
  const post = await start();
  authorizeStatus = 200;
  documentsResponse = { status: 404, body: '' };

  const result = await rpc(post, 'tools/call', { name: 'rename_document', arguments: { documentId: 'doc', title: 'Plan' } });

  expect(result).toEqual({ isError: true, content: [{ type: 'text', text: DOCUMENT_NOT_FOUND }] });
  expect(authorizationChecks).toBe(1);
});

it('reports a dropped read as unavailable because it cannot have changed anything', async () => {
  const post = await start();
  authorizeStatus = 200;
  documentsResponse = 'dropped';

  const result = await rpc(post, 'tools/call', { name: 'list_documents', arguments: {} });

  expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'UNAVAILABLE: RemDo is unavailable. Try again later.' }] });
  expect(authorizationChecks).toBe(1);
});

it('refuses a request body over 1 MiB before running any tool', async () => {
  const post = await start();
  authorizeStatus = 200;

  const response = await post('Bearer valid', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'create_document', arguments: { title: 'x'.repeat(1024 * 1024) } },
  });

  expect(response.status).toBe(413);
});

it('refuses to append more than 1000 notes, counting nested children, before opening the document', async () => {
  const post = await start();
  authorizeStatus = 200;
  const notes = [...Array.from({ length: 999 }, () => ({ text: 'Point' })), { text: 'Section', children: [{ text: 'Detail' }] }];

  const result = await rpc(post, 'tools/call', { name: 'append_children', arguments: { parent: 'missingdoc', notes } });

  expect(result).toEqual({
    isError: true,
    content: [{
      type: 'text',
      text: 'INVALID_ARGUMENT: Append at most 1000 notes per call, counting nested children; split the outline across calls.',
    }],
  });
  expect(withHeadlessOpenDocument).not.toHaveBeenCalled();
  expect(authorizationChecks).toBe(1);
});

it('rejects a target or address that is not valid before opening a document or calling the API', async () => {
  const post = await start();
  authorizeStatus = 200;
  documentsResponse = 'dropped';
  const refused = (name: string, args: Record<string, unknown>) => rpc(post, 'tools/call', { name, arguments: args });

  for (const target of ['', 'doc_', 'doc/..']) {
    expect(await refused('read_document', { target })).toMatchObject({
      isError: true,
      content: [{ text: 'INVALID_ARGUMENT: The target is not a documentId or a noteAddress.' }],
    });
  }
  for (const documentId of ['', 'doc_note', 'doc/..']) {
    expect(await refused('rename_document', { documentId, title: 'Plan' })).toMatchObject({
      isError: true,
      content: [{ text: 'INVALID_ARGUMENT: The documentId is not valid.' }],
    });
  }
  for (const parent of ['', 'doc_', 'doc/..']) {
    expect(await refused('append_children', { parent, notes: [] })).toMatchObject({
      isError: true,
      content: [{ text: 'INVALID_ARGUMENT: The parent is not a documentId or a noteAddress.' }],
    });
  }
  for (const noteAddress of ['', 'doc', 'doc/..']) {
    expect(await refused('set_child_list_type', { noteAddress, listType: 'check' })).toMatchObject({
      isError: true,
      content: [{ text: 'INVALID_ARGUMENT: The noteAddress is not valid.' }],
    });
  }
  expect(withHeadlessOpenDocument).not.toHaveBeenCalled();
  expect(authorizationChecks).toBe(12);
});
