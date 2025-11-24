import type { Provider } from '@lexical/yjs';
import { createYjsProvider } from '@y-sweet/client';
import type { ClientToken } from '@y-sweet/sdk';
import { resolveLoopbackHost } from '#lib/net/loopback';
import * as Y from 'yjs';
export type CollaborationProviderInstance = Provider & { destroy: () => void };

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => CollaborationProviderInstance;

const docInitPromises = new Map<string, Promise<void>>();
const docAuthInFlight = new Map<string, Promise<ClientToken>>();

export function createProviderFactory(origin?: string): ProviderFactory {
  const resolveEndpoints = createEndpointResolver(origin);

  return (id: string, docMap: Map<string, Y.Doc>) => {
    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    // Ensure the shared root exists before the provider starts syncing. Yjs warns when
    // collaborative types are accessed prior to being attached to a document, and
    // Lexical expects the `root` XmlText to always be present.
    doc.get('root', Y.XmlText);

    const endpoints = resolveEndpoints(id);

    const authEndpoint = async () => {
      const token = await getAuthToken(id, endpoints);
      return rewriteTokenHost(token);
    };

    const provider = createYjsProvider(doc, id, authEndpoint, {
      connect: false,
      showDebuggerLink: false,
    });
    let destroyed = false;

    const originalDestroy = provider.destroy.bind(provider);
    const destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      // Prevent the provider from scheduling reconnections after teardown, which can
      // otherwise keep Node processes (e.g., snapshot CLI) alive.
      provider.connect = () => Promise.resolve();
      provider.disconnect();
      originalDestroy();
    };

    return Object.assign(provider as unknown as Provider, { destroy }) as CollaborationProviderInstance;
  };
}

function createEndpointResolver(origin?: string) {
  const basePath = '/doc';
  const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';
  const base = normalizedOrigin ? `${normalizedOrigin}${basePath}` : basePath;

  return (docId: string) => {
    const encodedId = encodeURIComponent(docId);
    return {
      auth: `${base}/${encodedId}/auth`,
      create: `${base}/new`,
    };
  };
}

function ensureDocInitialized(docId: string, createEndpoint: string): Promise<void> {
  const existing = docInitPromises.get(docId);
  if (existing) {
    return existing;
  }

  // TODO: Remove client-side doc creation once the auth endpoint performs getOrCreate server-side.
  const promise = fetch(createEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ docId }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to create doc ${docId}: ${response.status} ${response.statusText}`);
      }
    })
    .catch((error) => {
      docInitPromises.delete(docId);
      throw error;
    });

  docInitPromises.set(docId, promise);
  return promise;
}

function getAuthToken(docId: string, endpoints: { auth: string; create: string }): Promise<ClientToken> {
  const existing = docAuthInFlight.get(docId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    await ensureDocInitialized(docId, endpoints.create);

    const requestAuth = async () =>
      fetch(endpoints.auth, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId }),
      });

    let response = await requestAuth();
    if (response.status === 404) {
      // If the server dropped the doc, ensure we re-run creation instead of reusing
      // the successful cached init promise.
      docInitPromises.delete(docId);
      await ensureDocInitialized(docId, endpoints.create);
      response = await requestAuth();
    }

    if (!response.ok) {
      throw new Error(`Failed to auth doc ${docId}: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as ClientToken;
  })();

  docAuthInFlight.set(docId, promise);
  return promise.finally(() => {
    docAuthInFlight.delete(docId);
  });
}

function rewriteTokenHost(token: ClientToken): ClientToken {
  if (typeof location === 'undefined') {
    return token;
  }

  const { hostname } = location;
  if (hostname.length === 0) {
    return token;
  }

  const rewrite = (raw: string) => {
    const url = new URL(raw);
    url.hostname = resolveLoopbackHost(url.hostname, hostname);
    return url.toString();
  };

  return {
    ...token,
    url: rewrite(token.url),
    baseUrl: rewrite(token.baseUrl),
  };
}

export interface MinimalProviderEvents {
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
  synced?: boolean;
  hasLocalChanges?: boolean;
}

function mergeSignals(...sources: (AbortSignal | undefined)[]): AbortSignal {
  const active = sources.filter(Boolean) as AbortSignal[];
  if (active.length === 0) {
    return new AbortController().signal; // never aborted
  }
  return AbortSignal.any(active);
}

export interface WaitForSyncOptions {
  signal?: AbortSignal;
  /**
   * Optional timeout in milliseconds. Defaults to 5000. Pass null to disable.
   */
  timeoutMs?: number | null;
  drainLocalChanges?: boolean;
}

/**
 * Wait until a collaboration provider reports `synced`, and optionally until it has no pending
 * local changes (hasLocalChanges === false). Rejects on connection errors or abort/timeout.
 *
 * Used by:
 * - CollaborationProvider (awaitSynced)
 * - snapshot CLI (save/load safety)
 */
export function waitForSync(
  provider: MinimalProviderEvents,
  { timeoutMs = 5000, signal, drainLocalChanges = true }: WaitForSyncOptions = {}
): Promise<void> {
  const requiresLocalClear = drainLocalChanges;
  const ready = () => provider.synced === true && (!requiresLocalClear || provider.hasLocalChanges !== true);

  if (ready()) {
    return Promise.resolve();
  }

  const timeoutSignal =
    typeof timeoutMs === 'number' ? AbortSignal.timeout(timeoutMs) : undefined;
  const mergedSignal = mergeSignals(signal, timeoutSignal);

  if (mergedSignal.aborted) {
    return Promise.reject(toAbortError(mergedSignal.reason));
  }

  return new Promise<void>((resolve, reject) => {
    function onAbort() {
      finish(() => reject(toAbortError(mergedSignal.reason)));
    }

    function onError(payload: unknown) {
      finish(() => reject(createConnectionError(payload)));
    }

    function onSyncLike() {
      if (ready()) {
        finish(resolve);
      }
    }

    function cleanup() {
      provider.off('sync', onSyncLike);
      provider.off('connection-close', onError);
      provider.off('connection-error', onError);
      if (requiresLocalClear) {
        provider.off('local-changes', onSyncLike);
      }
      mergedSignal.removeEventListener('abort', onAbort);
    }

    function finish(fn: () => void) {
      cleanup();
      fn();
    }

    mergedSignal.addEventListener('abort', onAbort, { once: true });
    provider.on('sync', onSyncLike);
    provider.on('connection-close', onError);
    provider.on('connection-error', onError);
    if (requiresLocalClear) {
      provider.on('local-changes', onSyncLike);
    }

    // Catch the case where state flipped between the initial ready check and listener registration.
    if (ready()) {
      finish(resolve);
    }
  });
}

function toAbortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return new Error(typeof reason === 'string' ? reason : 'Aborted');
}

function createConnectionError(payload: unknown): Error {
  if (payload && typeof payload === 'object') {
    const maybeReason = (payload as { reason?: unknown }).reason;
    if (typeof maybeReason === 'string' && maybeReason.length > 0) {
      return new Error(`Failed to connect to collaboration server: ${maybeReason}`);
    }
  }
  return new Error('Failed to connect to collaboration server');
}
