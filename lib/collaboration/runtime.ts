import type { Provider } from '@lexical/yjs';
import { createYjsProvider } from '@y-sweet/client';
import type { ClientToken } from '@y-sweet/sdk';
import * as Y from 'yjs';

export type CollaborationProviderInstance = Provider & { destroy: () => void };

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => CollaborationProviderInstance;

const docInitPromises = new Map<string, Promise<void>>();
const docAuthInFlight = new Map<string, Promise<ClientToken>>();
const neverAbortingSignal = new AbortController().signal;

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
    if (url.hostname === '0.0.0.0' || url.hostname === 'localhost') {
      url.hostname = hostname;
    }
    return url.toString();
  };

  return {
    ...token,
    url: rewrite(token.url),
    baseUrl: rewrite(token.baseUrl),
  };
}

interface MinimalProviderEvents {
  on: (event: any, handler: (payload: any) => void) => void;
  off: (event: any, handler: (payload: any) => void) => void;
  synced?: boolean;
  hasLocalChanges?: boolean;
}

function waitForEvent(
  provider: MinimalProviderEvents,
  event: string,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(toAbortError(signal.reason));
  }

  return new Promise<void>((resolve, reject) => {
    let cleaned = false;

    const onEvent = () => finish(resolve);
    const onAbort = () => finish(() => reject(toAbortError(signal.reason)));

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      provider.off(event, onEvent);
      signal.removeEventListener('abort', onAbort);
    };

    function finish(fn: () => void) {
      cleanup();
      fn();
    }

    signal.addEventListener('abort', onAbort, { once: true });
    provider.on(event, onEvent);
  });
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
  {
    timeoutMs = 5000,
    signal,
    drainLocalChanges = true,
  }: { timeoutMs?: number; signal?: AbortSignal; drainLocalChanges?: boolean } = {}
): Promise<void> {
  const requiresLocalClear = drainLocalChanges;
  const hasPendingLocalChanges = () => requiresLocalClear && provider.hasLocalChanges !== false;

  if (!requiresLocalClear && provider.synced && !hasPendingLocalChanges()) {
    return Promise.resolve();
  }

  const mergedSignal = mergeAbortSignals([signal, AbortSignal.timeout(timeoutMs)]);
  if (mergedSignal.aborted) {
    const reason = mergedSignal.reason ?? new Error('Aborted');
    return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
  }

  const readyPredicate = () => provider.synced === true && !hasPendingLocalChanges();
  if (readyPredicate()) {
    return Promise.resolve();
  }

  const watchLoop = async () => {
    let sawLocalEvent = false;

    for (;;) {
      if (requiresLocalClear && !hasPendingLocalChanges()) {
        sawLocalEvent = true;
      }

      if (readyPredicate() && (!requiresLocalClear || sawLocalEvent)) {
        return;
      }
      if (mergedSignal.aborted) {
        throw toAbortError(mergedSignal.reason);
      }

      // Abort controller to clean up whichever waiters lose the race.
      const iterationAbort = new AbortController();
      const iterationSignal = mergeAbortSignals([mergedSignal, iterationAbort.signal]);

      const waitFor = (event: string, rejectAs?: () => Error) =>
        waitForEvent(provider, event, iterationSignal).then(() => {
          if (rejectAs) {
            throw rejectAs();
          }
          return event;
        });

      const waiters: Promise<string>[] = [
        waitFor('sync'),
        waitFor('connection-close', () => createConnectionError({ reason: 'connection-close' })),
        waitFor('connection-error', () => createConnectionError({ reason: 'connection-error' })),
      ];

      if (requiresLocalClear) {
        waiters.push(waitFor('local-changes'));
      }

      try {
        const event = await Promise.race(waiters);
        if (requiresLocalClear && event === 'local-changes') {
          sawLocalEvent = true;
        }
      } finally {
        // Cancel remaining waiters to release listeners and swallow their abort rejections.
        iterationAbort.abort(new DOMException('iteration-complete', 'AbortError'));
        await Promise.allSettled(waiters);
      }
    }
  };

  return watchLoop();
}

function mergeAbortSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const active = signals.filter(Boolean) as AbortSignal[];
  if (active.length === 0) {
    return neverAbortingSignal;
  }
  if (active.length === 1) {
    return active[0]!;
  }

  const controller = new AbortController();
  const abort = (reason: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  for (const sig of active) {
    if (sig.aborted) {
      abort(sig.reason);
      break;
    }
    sig.addEventListener('abort', () => abort(sig.reason), { once: true });
  }
  return controller.signal;
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
