import type { Provider } from '@lexical/yjs';
import { createYjsProvider } from '@y-sweet/client';
import type { ClientToken } from '@y-sweet/sdk';
import { trace } from '#lib/log';
import { resolveLoopbackHost } from '#lib/net/loopback';
import * as Y from 'yjs';
export type CollaborationProviderInstance = Provider & { destroy: () => void };
type CollaborationProviderConnectionStatus =
  | 'offline'
  | 'connecting'
  | 'error'
  | 'handshaking'
  | 'connected';
export type CollaborationConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'handshaking'
  | 'connected';

export interface MinimalProviderEvents {
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
  synced?: boolean;
  hasLocalChanges?: boolean;
}

export interface CollaborationSessionProvider extends CollaborationProviderInstance {
  synced?: boolean;
  hasLocalChanges?: boolean;
  status: CollaborationProviderConnectionStatus;
}

export type CollaborationProviderEventsView = CollaborationSessionProvider & MinimalProviderEvents;

export interface ProviderFactoryResult {
  provider: CollaborationSessionProvider;
  doc: Y.Doc;
}

export type ProviderFactory = (
  id: string,
  docMap: Map<string, Y.Doc>
) => ProviderFactoryResult | Promise<ProviderFactoryResult>;

export function asCollaborationProviderEvents(provider: CollaborationSessionProvider): CollaborationProviderEventsView {
  return provider as CollaborationProviderEventsView;
}

export function toCollaborationConnectionStatus(
  status: CollaborationProviderConnectionStatus
): CollaborationConnectionStatus {
  return status === 'offline' ? 'disconnected' : status;
}

const docInitPromises = new Map<string, Promise<void>>();
const docAuthInFlight = new Map<string, Promise<ClientToken>>();

export interface LocalPersistenceSupportDecision {
  enabled: boolean;
  reason?: string;
}

const LOCAL_PERSISTENCE_PROBE_DB = 'remdo-local-persistence-probe';
const LOCAL_PERSISTENCE_PROBE_STORE = 'probe';
let localPersistenceSupportDecisionPromise: Promise<LocalPersistenceSupportDecision> | null = null;

export function getLocalPersistenceSupportDecision(): Promise<LocalPersistenceSupportDecision> {
  if (!localPersistenceSupportDecisionPromise) {
    localPersistenceSupportDecisionPromise = evaluateLocalPersistenceSupportDecision();
  }
  return localPersistenceSupportDecisionPromise;
}

async function evaluateLocalPersistenceSupportDecision(): Promise<LocalPersistenceSupportDecision> {
  const indexedDb = (globalThis as { indexedDB?: IDBFactory | null }).indexedDB;
  if (!indexedDb) {
    return { enabled: false, reason: 'indexedDB unavailable' };
  }

  if (!('crypto' in globalThis) || !('subtle' in globalThis.crypto)) {
    return { enabled: false, reason: 'crypto.subtle unavailable' };
  }

  if (typeof globalThis.crypto.subtle.generateKey !== 'function') {
    return { enabled: false, reason: 'crypto.subtle.generateKey unavailable' };
  }

  const indexedDbOpenable = await canOpenIndexedDb(indexedDb);
  if (!indexedDbOpenable) {
    return { enabled: false, reason: 'indexedDB open failed' };
  }

  return { enabled: true };
}

async function canOpenIndexedDb(indexedDb: IDBFactory): Promise<boolean> {
  let db: IDBDatabase | null = null;
  try {
    db = await openIndexedDbProbe(indexedDb);
    return true;
  } catch (error) {
    trace('collab', 'local persistence probe failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    db?.close();
    tryDeleteIndexedDbProbe(indexedDb);
  }
}

function openIndexedDbProbe(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(LOCAL_PERSISTENCE_PROBE_DB, 1);
    } catch (error) {
      reject(error);
      return;
    }

    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_PERSISTENCE_PROBE_STORE)) {
        db.createObjectStore(LOCAL_PERSISTENCE_PROBE_STORE);
      }
    });
    request.addEventListener('error', () => reject(request.error ?? new Error('indexedDB open failed')));
    request.addEventListener('blocked', () => reject(new Error('indexedDB open blocked')));
    request.addEventListener('success', () => resolve(request.result));
  });
}

function tryDeleteIndexedDbProbe(indexedDb: IDBFactory) {
  try {
    const request = indexedDb.deleteDatabase(LOCAL_PERSISTENCE_PROBE_DB);
    request.addEventListener('error', () => {});
    request.addEventListener('blocked', () => {});
  } catch {
    // Ignore probe-cleanup failures.
  }
}

export function createProviderFactory(origin?: string): ProviderFactory {
  const resolveEndpoints = createEndpointResolver(origin);

  return async (id: string, docMap: Map<string, Y.Doc>) => {
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

    const localPersistenceSupport = await getLocalPersistenceSupportDecision();
    trace(
      'collab',
      localPersistenceSupport.enabled ? 'local persistence enabled' : 'local persistence disabled',
      { docId: id, ...(localPersistenceSupport.reason ? { reason: localPersistenceSupport.reason } : {}) }
    );

    const provider = createYjsProvider(doc, id, authEndpoint, {
      connect: false,
      offlineSupport: localPersistenceSupport.enabled,
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

    return {
      provider: Object.assign(provider as unknown as Provider, {
        destroy,
      }) as CollaborationSessionProvider,
      doc,
    };
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

const RETRYABLE_HTTP_STATUSES = new Set([429]);

function isRetriableStatus(status: number): boolean {
  return status >= 500 || RETRYABLE_HTTP_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDocInitialized(docId: string, createEndpoint: string): Promise<void> {
  const existing = docInitPromises.get(docId);
  if (existing) {
    return existing;
  }

  // TODO: Remove client-side doc creation once the auth endpoint performs getOrCreate server-side.
  const promise = (async () => {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(createEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId }),
      });
      if (response.ok) {
        return;
      }
      const error = new Error(`Failed to create doc ${docId}: ${response.status} ${response.statusText}`);
      if (!isRetriableStatus(response.status) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(100 * attempt);
    }
  })().catch((error) => {
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
    trace('collab', 'requesting auth token', { docId });
    await ensureDocInitialized(docId, endpoints.create);

    const requestAuth = async () =>
      fetch(endpoints.auth, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId }),
      });

    let response = await requestAuth();
    if (response.status === 404) {
      trace('collab', 'doc missing during auth; recreating', { docId });
      // If the server dropped the doc, ensure we re-run creation instead of reusing
      // the successful cached init promise.
      docInitPromises.delete(docId);
      await ensureDocInitialized(docId, endpoints.create);
      response = await requestAuth();
    }

    if (!response.ok) {
      trace('collab', 'auth token request failed', { docId, status: response.status });
      throw new Error(`Failed to auth doc ${docId}: ${response.status} ${response.statusText}`);
    }

    trace('collab', 'auth token ready', { docId });
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

  const { hostname, protocol } = location;
  if (hostname.length === 0) {
    return token;
  }

  const rewrite = (raw: string) => {
    const url = new URL(raw);
    url.hostname = resolveLoopbackHost(url.hostname, hostname);
    const needsUpgrade = protocol === 'https:' && (url.protocol === 'ws:' || url.protocol === 'http:');
    if (needsUpgrade) {
      url.protocol = url.protocol === 'ws:' ? 'wss:' : 'https:';
    }
    return url.toString();
  };

  return {
    ...token,
    url: rewrite(token.url),
    baseUrl: rewrite(token.baseUrl),
  };
}

function mergeSignals(...sources: (AbortSignal | undefined)[]): AbortSignal {
  const active = sources.filter(Boolean) as AbortSignal[];
  if (active.length === 0) {
    return new AbortController().signal; // never aborted
  }
  return AbortSignal.any(active);
}

interface WaitForSyncOptions {
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
