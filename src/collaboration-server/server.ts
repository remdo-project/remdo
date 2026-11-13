import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server } from '@hocuspocus/server';
import type { Document } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import * as Y from 'yjs';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { createEditorHandler } from '../headless/editor-handler';
import { applyTree, saveTree } from '../headless/outline-tree/yjs';
import type { Document as OutlineDocument } from '../headless/outline-tree/tree';
import { DJANGO_REQUEST_TIMEOUT_MS, isBearer, requestDjango } from '#platform/net/django-request';
import { decodePersistenceMessage, encodePersistenceMessage } from '#platform/net/persistence-barrier';
import { COLLABORATION_AUTHORIZATION_REJECTED } from '#platform/net/authorization-error';
import {
  DOCUMENT_LIST_CHANGED,
  DOCUMENT_LIST_KEEPALIVE,
  DOCUMENT_LIST_KEEPALIVE_INTERVAL_MS,
  DOCUMENT_LIST_PATH,
} from '#platform/net/document-list-socket';

export const INTERNAL_SECRET_HEADER = 'X-Remdo-Collaboration-Secret';
// Workspace rooms are named apart from editor documents, whose IDs share their alphabet.
const WORKSPACE_ROOM_PREFIX = 'workspace:';

// A workspace room commits its text once editing pauses, and at the latest this long after the
// first edit its file lacks.
const COMMIT_IDLE_MS = 2 * 60_000;
const COMMIT_CAP_MS = 10 * 60_000;

const workspaceOf = (room: string) => (room.startsWith(WORKSPACE_ROOM_PREFIX) ? room.slice(WORKSPACE_ROOM_PREFIX.length) : null);

interface ServerOptions {
  port: number;
  apiOrigin: string;
  secret: string;
  appOrigin: string;
  documentSlots?: number;
}

class CollaborationUnavailable extends Error {
  readonly reason = 'collaboration.service-unavailable';
  constructor(message = 'collaboration.service-unavailable') { super(message); }
}

class AuthorizationRejected extends Error {
  readonly reason = COLLABORATION_AUTHORIZATION_REJECTED;
  constructor() { super(COLLABORATION_AUTHORIZATION_REJECTED); }
}

class DocumentDeleted extends Error {
  constructor() { super('collaboration.document-deleted'); }
}

// Django refused a workspace room's save for good; another try succeeds only after an edit.
class SaveRefused extends Error {
  constructor() { super('collaboration.save-refused'); }
}

export function createCollaborationServer({ port, apiOrigin, secret, appOrigin, documentSlots = 1 }: ServerOptions) {
  if (!secret) throw new Error('COLLAB_INTERNAL_SECRET is required.');
  const editorRequests = new Set<Promise<void>>();
  const handleEditor = createEditorHandler(appOrigin, documentSlots);
  const dirty = new Map<Document, number>();
  const deleted = new WeakSet<Document>();
  // A workspace room holding text its file lacks, and the timers that commit it.
  const uncommitted = new Map<Document, { since: number; idle?: ReturnType<typeof setTimeout>; cap: ReturnType<typeof setTimeout> }>();
  const retries = new Map<Document, ReturnType<typeof setTimeout>>();
  const retryDelays = new Map<Document, number>();
  const documentListSockets = new Map<string, Set<WebSocket>>();
  const documentListServer = new WebSocketServer({ noServer: true });
  const documentListKeepalive = setInterval(() => {
    for (const listeners of documentListSockets.values()) {
      for (const listener of listeners) listener.send(DOCUMENT_LIST_KEEPALIVE);
    }
  }, DOCUMENT_LIST_KEEPALIVE_INTERVAL_MS);
  const queuedSaves = new Map<Document, Promise<void>>();
  // A loaded workspace room's file version, which its Yjs state holds.
  const workspaceVersions = new WeakMap<Document, string | null>();
  let revision = 0;
  let stopping = false;
  let server: Server;
  const authorizedOperator = (value: string | undefined) => {
    const received = Buffer.from(value ?? '');
    const expected = Buffer.from(secret);
    return received.length === expected.length && timingSafeEqual(received, expected);
  };
  const endpoint = (room: string, operation: string) => {
    const workspace = workspaceOf(room);
    const path = workspace === null ? `documents/${encodeURIComponent(room)}` : `workspaces/${encodeURIComponent(workspace)}`;
    return new URL(`/internal/collaboration/${path}/${operation}`, apiOrigin);
  };
  const internalHeaders = { [INTERNAL_SECRET_HEADER]: secret, Host: new URL(appOrigin).host };

  // A WebSocket, unlike a long-lived HTTP response, holds none of the browser's
  // few HTTP/1.1 connections per host, so open tabs cannot starve API requests.
  // Sharing the collaboration path keeps every gateway and proxy rule routing it.
  async function openDocumentListSocket(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = (status: string) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    // Nothing else listens until the upgrade completes, so a client reset while
    // the session is checked would otherwise crash the hub.
    const ignoreReset = () => {};
    socket.on('error', ignoreReset);
    let session: Awaited<ReturnType<typeof requestDjango>>;
    try {
      session = await requestDjango(new URL('/internal/collaboration/session', apiOrigin), {
        headers: { ...internalHeaders, Cookie: request.headers.cookie ?? '', Origin: request.headers.origin ?? '' },
        signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error('collaboration.document-list-session-unreachable', error);
      reject('503 Service Unavailable');
      return;
    }
    if (!session.ok && session.status !== 403) {
      console.error('collaboration.document-list-session-failed', session.status);
    }
    if (!session.ok || stopping || socket.destroyed) {
      reject(session.status === 403 ? '403 Forbidden' : '503 Service Unavailable');
      return;
    }
    const { userId } = JSON.parse(session.body.toString()) as { userId: string };
    socket.off('error', ignoreReset);
    documentListServer.handleUpgrade(request, socket, head, (listener) => {
      const listeners = documentListSockets.get(userId) ?? new Set();
      documentListSockets.set(userId, listeners);
      listeners.add(listener);
      // ws closes the socket after reporting a malformed frame; unhandled, the
      // report would crash the hub.
      listener.on('error', () => {});
      listener.once('close', () => {
        listeners.delete(listener);
        if (!listeners.size) documentListSockets.delete(userId);
      });
    });
  }

  async function relayDocumentListNotice(request: IncomingMessage, response: ServerResponse) {
    if (!authorizedOperator(request.headers[INTERNAL_SECRET_HEADER.toLowerCase()] as string | undefined)) {
      response.writeHead(403).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const { userIds } = JSON.parse(Buffer.concat(chunks).toString()) as { userIds: string[] };
    for (const userId of userIds) {
      for (const listener of documentListSockets.get(userId) ?? []) listener.send(DOCUMENT_LIST_CHANGED);
    }
    response.writeHead(204).end();
  }

  /**
   * Save a workspace room's tree and state, writing its file too when committing. A file changed
   * since the state's version is applied to the state, which then saves again; each version the
   * state comes to hold is recorded at once, so a later failure can't make a save apply it twice.
   */
  async function saveWorkspaceRoom(document: Document, doc: Y.Doc = document, commit = false) {
    for (;;) {
      const { tree, state } = saveTree(doc);
      const version = workspaceVersions.get(document) ?? null;
      const response = await requestDjango(endpoint(document.name, 'content'), {
        method: 'PUT',
        headers: { ...internalHeaders, 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ state: Buffer.from(state).toString('base64'), tree, version, commit })),
        signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
      });
      if (response.status !== 409) {
        if (response.ok) workspaceVersions.set(document, (JSON.parse(response.body.toString()) as { version: string | null }).version);
        return response;
      }
      const current = JSON.parse(response.body.toString()) as { version: string | null; tree: OutlineDocument };
      applyTree(doc, current.tree);
      workspaceVersions.set(document, current.version);
    }
  }

  async function writeState(document: Document, commit = false) {
    if (deleted.has(document)) throw new DocumentDeleted();
    const savedRevision = dirty.get(document);
    try {
      const response = workspaceOf(document.name) === null
        ? await requestDjango(endpoint(document.name, 'content'), {
          method: 'PUT',
          headers: { ...internalHeaders, 'Content-Type': 'application/octet-stream' },
          body: Buffer.from(Y.encodeStateAsUpdate(document)),
          signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
        })
        : await saveWorkspaceRoom(document, document, commit);
      if (response.status === 404) {
        deleted.add(document);
        dirty.delete(document);
        forgetUncommitted(document);
        clearTimeout(retries.get(document));
        retries.delete(document);
        retryDelays.delete(document);
        server.hocuspocus.closeConnections(document.name);
        throw new DocumentDeleted();
      }
      // The refused edits stay with the room's clients; the next edit tries again.
      if (response.status === 422) {
        if (dirty.get(document) === savedRevision) dirty.delete(document);
        forgetUncommitted(document);
        throw new SaveRefused();
      }
      if (!response.ok) throw new Error('collaboration.store-failed');
      if (dirty.get(document) === savedRevision) dirty.delete(document);
      clearTimeout(retries.get(document));
      retries.delete(document);
      retryDelays.delete(document);
    } catch (error) {
      if (error instanceof DocumentDeleted || error instanceof SaveRefused) throw error;
      scheduleRetry(document);
      // Hocuspocus logs hook failures: never attach the request, content, or original error.
      throw new Error('collaboration.store-failed');
    }
  }

  function markUncommitted(document: Document, since = Date.now(), soonest = 0) {
    const commit = () => void commitRoom(document).catch(() => {});
    const pending = uncommitted.get(document)
      ?? { since, cap: setTimeout(commit, Math.max(soonest, since + COMMIT_CAP_MS - Date.now())) };
    clearTimeout(pending.idle);
    pending.idle = setTimeout(commit, COMMIT_IDLE_MS);
    uncommitted.set(document, pending);
  }

  function forgetUncommitted(document: Document) {
    const pending = uncommitted.get(document);
    clearTimeout(pending?.idle);
    clearTimeout(pending?.cap);
    uncommitted.delete(document);
  }

  /** Commit a workspace room's text; edits arriving meanwhile wait for the next commit. */
  async function commitRoom(document: Document) {
    const pending = uncommitted.get(document);
    if (!pending) return;
    forgetUncommitted(document);
    try {
      await save(document, true);
    } catch (error) {
      // A failed commit tries again no sooner than an idle period, so it can't spin past its cap.
      const final = error instanceof DocumentDeleted || error instanceof SaveRefused;
      if (!final && !uncommitted.has(document)) markUncommitted(document, pending.since, COMMIT_IDLE_MS);
      throw error;
    }
  }

  /**
   * A workspace room's state. When it doesn't hold the current file, the file's tree is applied
   * and saved before any client syncs, so every load after one change gives the same state.
   */
  async function loadWorkspaceRoom(document: Document) {
    const loaded = JSON.parse((await loadContent(endpoint(document.name, 'content'))).toString()) as {
      version: string | null; state: string | null; uncommittedSince: string | null; tree?: OutlineDocument;
    };
    workspaceVersions.set(document, loaded.version);
    const doc = new Y.Doc();
    if (loaded.state) Y.applyUpdate(doc, Buffer.from(loaded.state, 'base64'));
    if (loaded.tree) {
      applyTree(doc, loaded.tree);
      const saved = await saveWorkspaceRoom(document, doc).catch(() => null);
      if (!saved?.ok) throw new CollaborationUnavailable('collaboration.load-failed');
    } else if (loaded.uncommittedSince) {
      markUncommitted(document, Date.parse(loaded.uncommittedSince));
    }
    const state = Y.encodeStateAsUpdate(doc);
    doc.destroy();
    return state;
  }

  async function loadContent(url: URL) {
    let response: Awaited<ReturnType<typeof requestDjango>>;
    try {
      response = await requestDjango(url, { headers: internalHeaders, signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS) });
    } catch {
      throw new CollaborationUnavailable('collaboration.load-failed');
    }
    if (response.status === 404) throw new DocumentDeleted();
    if (!response.ok) throw new CollaborationUnavailable('collaboration.load-failed');
    return response.body;
  }

  function scheduleRetry(document: Document) {
    if (retries.has(document) || stopping || deleted.has(document)) return;
    const delay = Math.min((retryDelays.get(document) ?? 500) * 2, 30_000);
    retryDelays.set(document, delay);
    retries.set(document, setTimeout(() => {
      retries.delete(document);
      void flush(document).catch(() => {});
    }, delay));
  }

  function save(document: Document, commit = false) {
    return document.saveMutex.runExclusive(() => writeState(document, commit));
  }

  // A save not yet started already covers every update received before it
  // starts, so later requests share it: at most one save runs and one waits.
  function requestSave(document: Document) {
    const queued = queuedSaves.get(document);
    if (queued) return queued;
    const next = document.saveMutex.runExclusive(() => {
      queuedSaves.delete(document);
      return writeState(document);
    });
    queuedSaves.set(document, next);
    return next;
  }

  async function flush(document: Document) {
    try {
      await save(document);
    } finally {
      await server.hocuspocus.unloadDocument(document);
    }
  }

  server = new Server({
    address: '127.0.0.1',
    port,
    quiet: true,
    stopOnSignals: false,
    debounce: 1000,
    maxDebounce: 5000,
    extensions: [new Database({
      fetch: async ({ document, documentName }) => {
        if (workspaceOf(documentName) !== null) return loadWorkspaceRoom(document);
        const bytes = new Uint8Array(await loadContent(endpoint(documentName, 'content')));
        return bytes.length ? bytes : null;
      },
      store: async ({ document }) => {
        try {
          await writeState(document);
        } catch (error) {
          // A deleted registry row or a refused save is terminal. Let Hocuspocus finish
          // unloading; persistence requests still fail rather than acknowledge a SQL commit.
          if (!(error instanceof DocumentDeleted || error instanceof SaveRefused)) throw error;
        }
      },
    })],
    async onUpgrade({ request, socket, head }) {
      if (!stopping && request.url === DOCUMENT_LIST_PATH) {
        await openDocumentListSocket(request, socket, head);
        // eslint-disable-next-line no-throw-literal
        throw null;
      }
      // Accepted editor requests can acquire their document after shutdown starts.
      const drainingEditor = editorRequests.size > 0 && isBearer(request.headers.authorization)
        && authorizedOperator(request.headers[INTERNAL_SECRET_HEADER.toLowerCase()] as string | undefined);
      if ((stopping && !drainingEditor) || request.url !== '/collaboration'
        || (!request.headers.origin && !isBearer(request.headers.authorization)
          && !authorizedOperator(request.headers[INTERNAL_SECRET_HEADER.toLowerCase()] as string | undefined))) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        // Hocuspocus uses an empty rejection to stop its default handler.
        // eslint-disable-next-line no-throw-literal
        throw null;
      }
    },
    async onAuthenticate({ documentName, requestHeaders }) {
      const authorization = requestHeaders.get('authorization');
      const operator = !isBearer(authorization)
        && authorizedOperator(requestHeaders.get(INTERNAL_SECRET_HEADER) ?? undefined);
      const headers: Record<string, string> = { ...internalHeaders };
      if (operator) headers['X-Remdo-Collaboration-Operator'] = '1';
      else if (isBearer(authorization)) headers.Authorization = authorization!;
      else {
        headers.Cookie = requestHeaders.get('cookie') ?? '';
        headers.Origin = requestHeaders.get('origin') ?? '';
      }
      let response: Awaited<ReturnType<typeof requestDjango>>;
      try {
        response = await requestDjango(endpoint(documentName, 'authorize'), {
          headers, signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new CollaborationUnavailable();
      }
      if (response.status === 401) throw new AuthorizationRejected();
      if ([403, 404].includes(response.status)) throw new Error('collaboration.access-denied');
      if (!response.ok) throw new CollaborationUnavailable();
      return { operator };
    },
    async onStateless({ connection, document, payload }) {
      const message = decodePersistenceMessage(payload);
      if (message?.type !== 'persist') return;
      try {
        await requestSave(document);
        connection.sendStateless(encodePersistenceMessage({ type: 'persisted', id: message.id }));
      } catch {
        connection.sendStateless(encodePersistenceMessage({ type: 'persist-failed', id: message.id }));
      }
    },
    async onChange({ document }) {
      if (deleted.has(document)) return;
      dirty.set(document, ++revision);
      if (workspaceOf(document.name) !== null) markUncommitted(document);
    },
    async beforeUnloadDocument({ document }) {
      const stored = !dirty.has(document) && await commitRoom(document).then(() => true, (error) => error instanceof SaveRefused);
      if (!stored) {
        scheduleRetry(document);
        throw new Error('collaboration.store-pending');
      }
    },
    async onRequest({ request, response }) {
      if (request.url === '/ready' && request.method === 'GET') {
        response.writeHead(stopping ? 503 : 200).end();
      } else if (request.url === '/internal/document-list-changed' && request.method === 'POST') {
        await relayDocumentListNotice(request, response);
      } else if (request.url === '/internal/editor' && request.method === 'POST') {
        if (stopping) response.writeHead(503).end();
        else if (!authorizedOperator(request.headers[INTERNAL_SECRET_HEADER.toLowerCase()] as string | undefined)
          || !isBearer(request.headers.authorization ?? '')) response.writeHead(403).end();
        else {
          const work = handleEditor(request, response);
          editorRequests.add(work);
          try { await work; } finally { editorRequests.delete(work); }
        }
      } else response.writeHead(404).end();
      // eslint-disable-next-line no-throw-literal
      throw null;
    },
  });

  return {
    server,
    async stop() {
      stopping = true;
      await Promise.allSettled(editorRequests);
      for (const timer of retries.values()) clearTimeout(timer);
      retries.clear();
      clearInterval(documentListKeepalive);
      for (const listeners of documentListSockets.values()) {
        for (const listener of listeners) listener.terminate();
      }
      const results = await Promise.allSettled([...server.hocuspocus.documents.values()].map(flush));
      for (const { idle, cap } of uncommitted.values()) {
        clearTimeout(idle);
        clearTimeout(cap);
      }
      uncommitted.clear();
      if (results.some(result => result.status === 'rejected')) {
        throw new Error('collaboration.shutdown-store-failed');
      }
      await server.destroy();
    },
    /** Commit the text of workspace rooms a previous run left uncommitted; true once Django has. */
    async commitPendingWorkspaces() {
      try {
        const response = await requestDjango(new URL('/internal/collaboration/workspaces/commit-pending', apiOrigin), {
          method: 'POST', headers: internalHeaders, signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
