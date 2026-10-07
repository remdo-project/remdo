import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { connect as connectSocket } from 'node:net';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCollaborationServer, INTERNAL_SECRET_HEADER } from './server';
import { DOCUMENT_LIST_KEEPALIVE, DOCUMENT_LIST_KEEPALIVE_INTERVAL_MS, DOCUMENT_LIST_PATH } from '#platform/net/document-list-socket';
import { requestPersistence } from '../collaboration/persistence-barrier';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '../collaboration/runtime';
import { withHeadlessOpenDocument } from '../headless/open-document';
import * as origins from '#platform/net/origins';
import { createDeferred } from '../../tests/unit/_support/deferred';

const secret = 'test-internal-secret';
let authorizeStatus: number;
let sessionStatus: number | 'reset';
let authorizeHeaders: Array<Record<string, string | string[] | undefined>>;
let loadStatus: number | 'dropped';
let storeStatus: number;
let failedDocument: string | undefined;
let deletedDocument: string | undefined;
let savedDocuments: Map<string, Uint8Array>;
let loaded: number;
let authorizations: number;
let sessionHeaders: Array<Record<string, string | string[] | undefined>>;
let holdSession: Promise<void> | undefined;
const runtimeCleanup: Array<() => void> = [];
let stores: Uint8Array[];
let persisted: Uint8Array;
let holdStore: Promise<void> | undefined;
let releaseStore: (() => void) | undefined;
let origin: string;
const clients: HocuspocusProvider[] = [];
let runtime: ReturnType<typeof createCollaborationServer>;
const backend = createServer((request, response) => {
  void (async () => {
    expect(request.headers[INTERNAL_SECRET_HEADER.toLowerCase()]).toBe(secret);
    expect(request.headers.host).toBe('remdo.test');
    if (request.url === '/internal/collaboration/session') {
      sessionHeaders.push(request.headers);
      await holdSession;
      if (sessionStatus === 'reset') {
        request.socket.destroy();
        return;
      }
      if (sessionStatus !== 200) {
        response.writeHead(sessionStatus).end();
        return;
      }
      const userId = /user=(\w+)/u.exec(request.headers.cookie ?? '')?.[1];
      if (userId) response.writeHead(200).end(JSON.stringify({ userId }));
      else response.writeHead(403).end();
      return;
    }
    const name = request.url!.split('/')[4]!;
    if (name === deletedDocument) {
      response.writeHead(404).end();
      return;
    }
    if (request.url?.endsWith('/authorize')) {
      authorizations++;
      authorizeHeaders.push(request.headers);
      response.writeHead(authorizeStatus).end('{}');
    } else if (request.method === 'GET') {
      loaded++;
      if (loadStatus === 'dropped') request.socket.destroy();
      else response.writeHead(loadStatus).end(persisted);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const state = new Uint8Array(Buffer.concat(chunks));
      stores.push(state);
      await holdStore;
      const status = name === failedDocument ? 503 : storeStatus;
      if (status === 204) { persisted = state; savedDocuments.set(name, state); }
      response.writeHead(status).end();
    }
  })();
});

beforeEach(async () => {
  authorizeStatus = 200;
  sessionStatus = 200;
  authorizeHeaders = [];
  loadStatus = 200;
  storeStatus = 204;
  failedDocument = undefined;
  deletedDocument = undefined;
  savedDocuments = new Map();
  loaded = 0;
  authorizations = 0;
  sessionHeaders = [];
  holdSession = undefined;
  stores = [];
  persisted = new Uint8Array();
  holdStore = undefined;
  releaseStore = undefined;
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  runtime = createCollaborationServer({
    port: 0,
    secret,
    apiOrigin: `http://127.0.0.1:${(backend.address() as AddressInfo).port}`,
    appOrigin: 'http://remdo.test',
  });
  await runtime.server.listen();
  origin = `http://127.0.0.1:${runtime.server.address.port}`;
});

afterEach(async () => {
  releaseStore?.();
  storeStatus = 204;
  failedDocument = undefined;
  deletedDocument = undefined;
  for (const cleanup of runtimeCleanup.splice(0)) cleanup();
  for (const provider of clients.splice(0)) {
    provider.destroy();
    provider.configuration.websocketProvider.destroy();
    provider.document.destroy();
  }
  await runtime.stop();
  backend.closeAllConnections();
  await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
});

function connect(name = 'document', headers: Record<string, string> = { [INTERNAL_SECRET_HEADER]: secret }) {
  class OperatorSocket extends WebSocket {
    constructor(url: string) {
      super(url, { headers });
    }
  }
  const provider = new HocuspocusProvider({
    websocketProvider: new HocuspocusProviderWebsocket({
      url: `${origin.replace('http:', 'ws:')}/collaboration`,
      WebSocketPolyfill: OperatorSocket,
    }),
    name,
    document: new Y.Doc(),
  });
  provider.attach();
  clients.push(provider);
  return provider;
}

function persist(provider: HocuspocusProvider) {
  return requestPersistence(provider).then(() => 'persisted', () => 'failed');
}

function text(state: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  const value = document.getText('text').toString();
  document.destroy();
  return value;
}

it('denies authorization before loading any document content', async () => {
  authorizeStatus = 403;
  const provider = connect();
  const failure = await new Promise<string>(resolve => {
    provider.on('authenticationFailed', ({ reason }: { reason: string }) => resolve(reason));
  });
  expect(failure).toBe('permission-denied');
  expect(loaded).toBe(0);
  expect(provider.synced).toBe(false);
  expectDiagnostics(['[onAuthenticate]']);
});

it('authorizes a bearer connection through Django without a browser origin', async () => {
  const provider = connect('document', { Authorization: 'bearer delegated-token' });
  await expect.poll(() => provider.synced).toBe(true);
  expect(authorizeHeaders).toHaveLength(1);
  expect(authorizeHeaders[0]!.authorization).toBe('bearer delegated-token');
  expect(authorizeHeaders[0]!.cookie).toBeUndefined();
  expect(authorizeHeaders[0]!['x-remdo-collaboration-operator']).toBeUndefined();
});

it('does not fabricate an empty synchronized document after a failed load', async () => {
  loadStatus = 404;
  const provider = connect();
  await expect.poll(() => loaded).toBeGreaterThan(0);
  await expect.poll(() => runtime.server.hocuspocus.loadingDocuments.size).toBe(0);
  expect(provider.synced).toBe(false);
  expect(runtime.server.hocuspocus.documents.size).toBe(0);
  expect(stores).toHaveLength(0);
  expectDiagnostics(['[onLoadDocument]']);
});

it('rejects an unsuccessful persistence request and persists the same edits after recovery', async () => {
  const provider = connect();
  await expect.poll(() => provider.synced).toBe(true);
  provider.document.getText('text').insert(0, 'recover me');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  storeStatus = 503;
  expect(await persist(provider)).toBe('failed');
  expect(persisted).toHaveLength(0);
  storeStatus = 204;
  expect(await persist(provider)).toBe('persisted');
  expect(text(persisted)).toBe('recover me');
  expect(runtime.server.hocuspocus.documents.has('document')).toBe(true);
});

it('retains dirty content after disconnect and retries storage after a failure', async () => {
  const provider = connect();
  await expect.poll(() => provider.synced).toBe(true);
  provider.document.getText('text').insert(0, 'offline database');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  storeStatus = 503;
  provider.configuration.websocketProvider.disconnect();
  await expect.poll(() => stores.length).toBeGreaterThan(0);
  expect(runtime.server.hocuspocus.documents.has('document')).toBe(true);
  storeStatus = 204;
  await expect.poll(() => persisted.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(text(persisted)).toBe('offline database');
  await expect.poll(() => runtime.server.hocuspocus.documents.has('document')).toBe(false);
  expectDiagnostics(['[onStoreDocument]', 'Caught error during storeDocumentHooks. Document stays in memory to avoid data loss']);
});

it('serializes persistence requests so a deletion made during a save is committed afterwards', async () => {
  const provider = connect();
  await expect.poll(() => provider.synced).toBe(true);
  provider.document.getText('text').insert(0, 'insert then delete');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  holdStore = new Promise(resolve => { releaseStore = resolve; });
  const first = persist(provider);
  await expect.poll(() => stores.length).toBe(1);
  provider.document.getText('text').delete(0, 18);
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  const second = persist(provider);
  releaseStore!();
  expect(await first).toBe('persisted');
  expect(await second).toBe('persisted');
  expect(text(stores[0]!)).toBe('insert then delete');
  expect(text(persisted)).toBe('');
});

it('shares one waiting save among persistence requests made during a save', async () => {
  const provider = connect();
  await expect.poll(() => provider.synced).toBe(true);
  provider.document.getText('text').insert(0, 'first');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  holdStore = new Promise(resolve => { releaseStore = resolve; });
  const running = persist(provider);
  await expect.poll(() => stores.length).toBe(1);
  provider.document.getText('text').insert(5, ' second');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  const waiting = Array.from({ length: 5 }, () => persist(provider));
  releaseStore!();
  expect(await Promise.all([running, ...waiting])).toEqual(Array.from({length: 6}).fill('persisted'));
  expect(stores).toHaveLength(2);
  expect(text(persisted)).toBe('first second');
});

function expectDiagnostics(messages: string[]) {
  const calls = vi.mocked(console.error).mock.calls;
  expect(new Set(calls.map(args => args[0]))).toEqual(new Set(messages));
  vi.mocked(console.error).mockClear();
}

it('attempts every document save during shutdown even when an earlier save fails', async () => {
  const bad = connect('bad');
  await expect.poll(() => bad.synced).toBe(true);
  const good = connect('good');
  await expect.poll(() => good.synced).toBe(true);
  bad.document.getText('text').insert(0, 'unavailable');
  good.document.getText('text').insert(0, 'must survive shutdown');
  await expect.poll(() => bad.unsyncedChanges + good.unsyncedChanges).toBe(0);
  failedDocument = 'bad';
  await expect(runtime.stop()).rejects.toThrow();
  expect(savedDocuments.has('good')).toBe(true);
  expect(text(savedDocuments.get('good')!)).toBe('must survive shutdown');
});

it('retires deleted documents instead of retrying missing content or claiming a commit', async () => {
  const provider = connect();
  await expect.poll(() => provider.synced).toBe(true);
  provider.document.getText('text').insert(0, 'deleted while connected');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  deletedDocument = 'document';
  const disconnected = new Promise<void>(resolve => provider.on('close', () => resolve()));
  expect(await persist(provider)).toBe('failed');
  await disconnected;
  provider.configuration.websocketProvider.disconnect();
  await expect.poll(() => runtime.server.hocuspocus.documents.has('document')).toBe(false);
  const reconnect = connect();
  const denied = await new Promise<string>(resolve => reconnect.on('authenticationFailed', ({ reason }: { reason: string }) => resolve(reason)));
  expect(denied).toBe('permission-denied');
  expectDiagnostics(['[onAuthenticate]']);
});

it('recovers a document connection after a temporary authorization service outage', async () => {
  class OperatorSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { [INTERNAL_SECRET_HEADER]: secret } }); }
  }
  authorizeStatus = 503;
  const { provider, doc } = createProviderFactory({
    visibleOrigin: origin,
    WebSocketPolyfill: OperatorSocket as unknown as typeof globalThis.WebSocket,
  })('document', new Map());
  runtimeCleanup.push(() => { provider.destroy(); doc.destroy(); });
  void provider.connect();
  await expect.poll(() => authorizations).toBeGreaterThan(0);
  authorizeStatus = 200;
  await expect.poll(() => provider.synced, { timeout: 3000 }).toBe(true);
  expectDiagnostics(['[onAuthenticate]']);
});

it.each([503, 'dropped'] as const)('recovers a runtime connection after a temporary document load failure (%s)', async (failure) => {
  class OperatorSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { [INTERNAL_SECRET_HEADER]: secret } }); }
  }
  loadStatus = failure;
  const saved = new Y.Doc();
  saved.getText('text').insert(0, 'saved before the outage');
  persisted = Y.encodeStateAsUpdate(saved);
  saved.destroy();
  const { provider, doc } = createProviderFactory({
    visibleOrigin: origin,
    WebSocketPolyfill: OperatorSocket as unknown as typeof globalThis.WebSocket,
  })('document', new Map());
  runtimeCleanup.push(() => { provider.destroy(); doc.destroy(); });
  void provider.connect();
  const ready = waitForSync(asCollaborationProviderEvents(provider)).catch((error: Error) => error);
  await expect.poll(() => loaded).toBeGreaterThan(0);
  expect(provider.synced).toBe(false);
  expect(stores).toHaveLength(0);
  loadStatus = 200;
  const result = await ready;
  expectDiagnostics(['[onLoadDocument]']);
  expect(result).toBeUndefined();
  expect(doc.getText('text').toString()).toBe('saved before the outage');
});

it('cancels headless acquisition during repeated authorization failures without a delayed append', async () => {
  const resolveOrigin = vi.spyOn(origins, 'resolveCollabServerOrigin').mockReturnValue(origin);
  runtimeCleanup.push(() => resolveOrigin.mockRestore());
  const controller = new AbortController();
  const options = { signal: controller.signal };
  authorizeStatus = 503;
  let outcome: string | undefined;
  const opening = withHeadlessOpenDocument('document', 'Bearer delegated-token',
    (document) => document.root.appendChildren([{ text: 'late append' }]), options)
    .then(() => { outcome = 'appended'; }, (error: Error) => { outcome = error.message; });
  try {
    await expect.poll(() => authorizations, { timeout: 3000 }).toBeGreaterThan(1);
    controller.abort(new Error('RemDo is busy; try again shortly.'));
    await expect.poll(() => outcome).toBe('RemDo is busy; try again shortly.');
  } finally {
    authorizeStatus = 200;
    const rejected = authorizations;
    await opening;
    // A rejection is logged only once its response reaches the server, which can
    // follow the cancellation; a late log would otherwise fail the next check.
    await expect.poll(() => vi.mocked(console.error).mock.calls.length, { timeout: 3000 }).toBe(rejected);
    expectDiagnostics(['[onAuthenticate]']);
  }
  const contents = await withHeadlessOpenDocument('document', 'Bearer delegated-token',
    async (document) => document.root.getChildren().map((note) => note.getText()), { readOnly: true });
  expect(contents).not.toContain('late append');
});

it('keeps writing after opening even when the acquisition deadline expires', async () => {
  const resolveOrigin = vi.spyOn(origins, 'resolveCollabServerOrigin').mockReturnValue(origin);
  runtimeCleanup.push(() => resolveOrigin.mockRestore());
  const controller = new AbortController();
  const opened = createDeferred();
  const resume = createDeferred();
  const write = withHeadlessOpenDocument('document', 'Bearer delegated-token', async (document) => {
    opened.resolve();
    await resume.promise;
    return document.root.appendChildren([{ text: 'written after opening' }]);
  }, { signal: controller.signal });
  await opened.promise;
  controller.abort(new Error('RemDo is busy; try again shortly.'));
  resume.resolve();
  await write;
  const contents = await withHeadlessOpenDocument('document', 'Bearer delegated-token',
    async (document) => document.root.getChildren().map((note) => note.getText()), { readOnly: true });
  expect(contents).toContain('written after opening');
});

it.each([
  { authorize: 403, load: 200, diagnostic: '[onAuthenticate]' },
  { authorize: 200, load: 404, diagnostic: '[onLoadDocument]' },
])('keeps denied or missing documents terminal ($diagnostic)', async ({ authorize, load, diagnostic }) => {
  class OperatorSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { [INTERNAL_SECRET_HEADER]: secret } }); }
  }
  authorizeStatus = authorize;
  loadStatus = load;
  const { provider, doc } = createProviderFactory({
    visibleOrigin: origin,
    WebSocketPolyfill: OperatorSocket as unknown as typeof globalThis.WebSocket,
  })('document', new Map());
  runtimeCleanup.push(() => { provider.destroy(); doc.destroy(); });
  void provider.connect();
  await expect.poll(() => provider.status).toBe('error');
  expect(provider.synced).toBe(false);
  expect(authorizations).toBe(1);
  expectDiagnostics([diagnostic]);
});

it('backs off repeated store failures and resets the delay after recovery', async () => {
  const provider = connect();
  await expect.poll(() => provider.synced).toBe(true);
  provider.document.getText('text').insert(0, 'retry with backoff');
  await expect.poll(() => provider.unsyncedChanges).toBe(0);
  storeStatus = 503;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    expect(await persist(provider)).toBe('failed');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(stores).toHaveLength(2));
    // Acquiring the same save mutex ensures the prior retry finished. This
    // explicit failed save leaves its already-scheduled retry in place.
    expect(await persist(provider)).toBe('failed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(stores).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(stores).toHaveLength(4));
    storeStatus = 204;
    expect(await persist(provider)).toBe('persisted');
    expect(text(persisted)).toBe('retry with backoff');
    storeStatus = 503;
    expect(await persist(provider)).toBe('failed');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(stores).toHaveLength(7));
  } finally {
    vi.useRealTimers();
  }
});

function openDocumentListSocket(headers: Record<string, string>) {
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}${DOCUMENT_LIST_PATH}`, { headers });
  return new Promise<{ socket: WebSocket; status: number }>((resolve) => {
    socket.once('open', () => resolve({ socket, status: 101 }));
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve({ socket, status: response.statusCode! });
    });
  });
}

async function notifyDocumentListChanged(userIds: string[], headers = { [INTERNAL_SECRET_HEADER]: secret }) {
  const response = await fetch(`${origin}/internal/document-list-changed`, {
    method: 'POST', headers, body: JSON.stringify({ userIds }),
  });
  return response.status;
}

it('relays a document-list notice only to the notified account\'s signed-in sockets', async () => {
  const alice = await openDocumentListSocket({ Cookie: 'user=alice', Origin: 'http://remdo.test' });
  const bob = await openDocumentListSocket({ Cookie: 'user=bob', Origin: 'http://remdo.test' });
  expect([alice.status, bob.status]).toEqual([101, 101]);
  expect(sessionHeaders.map(({ cookie, origin }) => [cookie, origin]))
    .toEqual([['user=alice', 'http://remdo.test'], ['user=bob', 'http://remdo.test']]);
  const bobMessages: string[] = [];
  bob.socket.on('message', (data: Buffer) => bobMessages.push(data.toString()));

  const aliceMessage = once(alice.socket, 'message');
  expect(await notifyDocumentListChanged(['alice'])).toBe(204);
  expect(String((await aliceMessage)[0])).toBe('changed');
  expect(bobMessages).toEqual([]);

  const closed = Promise.all([once(alice.socket, 'close'), once(bob.socket, 'close')]);
  await runtime.stop();
  await closed;
});

it('rejects a document-list socket without a session and a notice without the internal secret', async () => {
  const { status } = await openDocumentListSocket({ Origin: 'http://remdo.test' });
  expect(status).toBe(403);
  expect(await notifyDocumentListChanged(['alice'], { [INTERNAL_SECRET_HEADER]: 'wrong' })).toBe(403);
});

it.each([
  [500, 'collaboration.document-list-session-failed'],
  ['reset', 'collaboration.document-list-session-unreachable'],
] as const)('reports why a document-list socket is refused when the session check ends with %s', async (outcome, diagnostic) => {
  sessionStatus = outcome;
  const { status } = await openDocumentListSocket({ Cookie: 'user=alice', Origin: 'http://remdo.test' });
  expect(status).toBe(503);
  expectDiagnostics([diagnostic]);
});

const documentListUpgrade = `GET ${DOCUMENT_LIST_PATH} HTTP/1.1\r\nHost: remdo.test\r\nConnection: Upgrade\r\n`
  + 'Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
  + 'Cookie: user=alice\r\nOrigin: http://remdo.test\r\n\r\n';

it('keeps serving after a client resets its document-list socket during the session check', async () => {
  let releaseSession!: () => void;
  holdSession = new Promise((resolve) => { releaseSession = resolve; });
  const client = connectSocket(runtime.server.address.port, '127.0.0.1');
  await once(client, 'connect');
  client.write(documentListUpgrade);
  await vi.waitFor(() => expect(sessionHeaders).toHaveLength(1));
  client.resetAndDestroy();
  releaseSession();

  expect((await fetch(`${origin}/ready`)).status).toBe(200);
  expect(await notifyDocumentListChanged(['alice'])).toBe(204);
});

it('keeps serving after a signed-in client sends a malformed document-list frame', async () => {
  const client = connectSocket(runtime.server.address.port, '127.0.0.1');
  await once(client, 'connect');
  client.write(documentListUpgrade);
  expect(String((await once(client, 'data'))[0])).toMatch(/^HTTP\/1\.1 101 /u);
  const closed = once(client, 'close');
  // An unmasked client frame violates the protocol.
  client.write(Buffer.from([0x81, 0x00]));
  await closed;

  expect((await fetch(`${origin}/ready`)).status).toBe(200);
  expect(await notifyDocumentListChanged(['alice'])).toBe(204);
});

it('sends document-list keepalives to connected sockets', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const keepalive = createCollaborationServer({
      port: 0,
      secret,
      apiOrigin: `http://127.0.0.1:${(backend.address() as AddressInfo).port}`,
      appOrigin: 'http://remdo.test',
    });
    await keepalive.server.listen();
    try {
      const socket = new WebSocket(`ws://127.0.0.1:${keepalive.server.address.port}${DOCUMENT_LIST_PATH}`, {
        headers: { Cookie: 'user=alice', Origin: 'http://remdo.test' },
      });
      await once(socket, 'open');
      const message = once(socket, 'message');
      vi.advanceTimersByTime(DOCUMENT_LIST_KEEPALIVE_INTERVAL_MS);
      expect(String((await message)[0])).toBe(DOCUMENT_LIST_KEEPALIVE);
    } finally {
      await keepalive.stop();
    }
  } finally {
    vi.useRealTimers();
  }
});
