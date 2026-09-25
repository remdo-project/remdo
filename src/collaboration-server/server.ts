import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { Server } from '@hocuspocus/server';
import type { Document } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import * as Y from 'yjs';
import { decodePersistenceMessage, encodePersistenceMessage } from '#platform/net/persistence-barrier';

export const INTERNAL_SECRET_HEADER = 'X-Remdo-Collaboration-Secret';
export const DJANGO_REQUEST_TIMEOUT_MS = 10_000;

interface ServerOptions {
  port: number;
  apiOrigin: string;
  secret: string;
  appOrigin: string;
}

// Node fetch ignores a caller-supplied Host. The internal loopback connection
// must preserve Django's canonical public host without widening ALLOWED_HOSTS.
function requestDjango(url: URL, options: {
  method?: string;
  headers: Record<string, string>;
  body?: Buffer;
  signal: AbortSignal;
}): Promise<{ ok: boolean; status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, options, (response) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of response) chunks.push(Buffer.from(chunk));
        resolve({ ok: response.statusCode! >= 200 && response.statusCode! < 300, status: response.statusCode!, body: Buffer.concat(chunks) });
      })().catch(reject);
    });
    request.once('error', reject);
    request.end(options.body);
  });
}

class AuthorizationUnavailable extends Error {
  readonly reason = 'collaboration.service-unavailable';
  constructor() { super('collaboration.service-unavailable'); }
}

class DocumentDeleted extends Error {
  constructor() { super('collaboration.document-deleted'); }
}

export function createCollaborationServer({ port, apiOrigin, secret, appOrigin }: ServerOptions) {
  if (!secret) throw new Error('COLLAB_INTERNAL_SECRET is required.');
  const dirty = new Map<Document, number>();
  const deleted = new WeakSet<Document>();
  const retries = new Map<Document, ReturnType<typeof setTimeout>>();
  const retryDelays = new Map<Document, number>();
  let revision = 0;
  let stopping = false;
  let server: Server;
  const authorizedOperator = (value: string | undefined) => {
    const received = Buffer.from(value ?? '');
    const expected = Buffer.from(secret);
    return received.length === expected.length && timingSafeEqual(received, expected);
  };
  const endpoint = (id: string, operation: string) =>
    new URL(`/internal/collaboration/documents/${encodeURIComponent(id)}/${operation}`, apiOrigin);
  const internalHeaders = { [INTERNAL_SECRET_HEADER]: secret, Host: new URL(appOrigin).host };

  async function writeState(document: Document, state: Uint8Array) {
    if (deleted.has(document)) throw new DocumentDeleted();
    const savedRevision = dirty.get(document);
    try {
      const response = await requestDjango(endpoint(document.name, 'content'), {
        method: 'PUT',
        headers: { ...internalHeaders, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(state),
        signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
      });
      if (response.status === 404) {
        deleted.add(document);
        dirty.delete(document);
        clearTimeout(retries.get(document));
        retries.delete(document);
        retryDelays.delete(document);
        server.hocuspocus.closeConnections(document.name);
        throw new DocumentDeleted();
      }
      if (!response.ok) throw new Error('collaboration.store-failed');
      if (dirty.get(document) === savedRevision) dirty.delete(document);
      clearTimeout(retries.get(document));
      retries.delete(document);
      retryDelays.delete(document);
    } catch (error) {
      if (error instanceof DocumentDeleted) throw error;
      scheduleRetry(document);
      // Hocuspocus logs hook failures: never attach the request, content, or original error.
      throw new Error('collaboration.store-failed');
    }
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

  function save(document: Document) {
    return document.saveMutex.runExclusive(() => writeState(document, Y.encodeStateAsUpdate(document)));
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
      fetch: async ({ documentName }) => {
        try {
          const response = await requestDjango(endpoint(documentName, 'content'), {
            headers: internalHeaders,
            signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
          });
          if (!response.ok) throw new Error('collaboration.request-failed');
          const bytes = new Uint8Array(response.body);
          return bytes.length ? bytes : null;
        } catch {
          throw new Error('collaboration.load-failed');
        }
      },
      store: async ({ document, state }) => {
        try {
          await writeState(document, state);
        } catch (error) {
          // A deleted registry row is terminal. Let Hocuspocus finish unloading;
          // explicit flushes still reject rather than acknowledge a SQL commit.
          if (!(error instanceof DocumentDeleted)) throw error;
        }
      },
    })],
    async onUpgrade({ request, socket }) {
      if (stopping || request.url !== '/collaboration'
        || (!request.headers.origin && !authorizedOperator(request.headers[INTERNAL_SECRET_HEADER.toLowerCase()] as string | undefined))) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        // Hocuspocus uses an empty rejection to stop its default handler.
        // eslint-disable-next-line no-throw-literal
        throw null;
      }
    },
    async onAuthenticate({ documentName, requestHeaders }) {
      const operator = authorizedOperator(requestHeaders.get(INTERNAL_SECRET_HEADER) ?? undefined);
      const headers: Record<string, string> = { ...internalHeaders };
      if (operator) headers['X-Remdo-Collaboration-Operator'] = '1';
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
        throw new AuthorizationUnavailable();
      }
      if ([401, 403, 404].includes(response.status)) throw new Error('collaboration.access-denied');
      if (!response.ok) throw new AuthorizationUnavailable();
      return { operator };
    },
    async onStateless({ connection, document, payload }) {
      const message = decodePersistenceMessage(payload);
      if (message?.type !== 'persist') return;
      try {
        await save(document);
        connection.sendStateless(encodePersistenceMessage({ type: 'persisted', id: message.id }));
      } catch {
        connection.sendStateless(encodePersistenceMessage({ type: 'persist-failed', id: message.id }));
      }
    },
    async onChange({ document }) {
      if (!deleted.has(document)) dirty.set(document, ++revision);
    },
    async beforeUnloadDocument({ document }) {
      if (dirty.has(document)) {
        scheduleRetry(document);
        throw new Error('collaboration.store-pending');
      }
    },
    async onRequest({ request, response }) {
      if (request.url === '/ready' && request.method === 'GET') {
        response.writeHead(stopping ? 503 : 200).end();
      } else response.writeHead(404).end();
      // eslint-disable-next-line no-throw-literal
      throw null;
    },
  });

  return {
    server,
    async stop() {
      stopping = true;
      for (const timer of retries.values()) clearTimeout(timer);
      retries.clear();
      const results = await Promise.allSettled([...server.hocuspocus.documents.values()].map(flush));
      if (results.some(result => result.status === 'rejected')) {
        throw new Error('collaboration.shutdown-store-failed');
      }
      await server.destroy();
    },
  };
}
