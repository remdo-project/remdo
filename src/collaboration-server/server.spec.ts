import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCollaborationServer, INTERNAL_SECRET_HEADER } from './server';
import { requestPersistence } from '../collaboration/persistence-barrier';
import { createProviderFactory } from '../collaboration/runtime';

const secret = 'test-internal-secret';
let authorizeStatus: number;
let authorizeHeaders: Array<Record<string, string | string[] | undefined>>;
let loadStatus: number;
let storeStatus: number;
let failedDocument: string | undefined;
let deletedDocument: string | undefined;
let savedDocuments: Map<string, Uint8Array>;
let loaded: number;
let authorizations: number;
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
      response.writeHead(loadStatus).end(persisted);
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
  authorizeHeaders = [];
  loadStatus = 200;
  storeStatus = 204;
  failedDocument = undefined;
  deletedDocument = undefined;
  savedDocuments = new Map();
  loaded = 0;
  authorizations = 0;
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

it('keeps a denied runtime connection terminal rather than retrying authentication', async () => {
  class OperatorSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { [INTERNAL_SECRET_HEADER]: secret } }); }
  }
  authorizeStatus = 403;
  const { provider, doc } = createProviderFactory({
    visibleOrigin: origin,
    WebSocketPolyfill: OperatorSocket as unknown as typeof globalThis.WebSocket,
  })('document', new Map());
  runtimeCleanup.push(() => { provider.destroy(); doc.destroy(); });
  void provider.connect();
  await expect.poll(() => provider.status).toBe('error');
  expect(provider.synced).toBe(false);
  expect(authorizations).toBe(1);
  expectDiagnostics(['[onAuthenticate]']);
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
