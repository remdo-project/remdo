import type { Provider } from '@lexical/yjs';
import { createYjsProvider } from '@y-sweet/client';
import type { ClientToken } from '@y-sweet/sdk';
import { createDocumentSyncTokenApiPath } from '#document-routes';
import { trace } from '#platform/log';
import { guardYSweetIndexedDbProviderLifecycle } from './y-sweet-indexeddb-lifecycle';
import * as Y from 'yjs';

const TRAILING_SLASH_PATTERN = /\/$/;

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

const docTokenInFlight = new Map<string, Promise<ClientToken>>();

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

interface CollaborationEndpointOptions {
  apiOrigin?: string;
  createSyncTokenPath?: (docId: string) => string;
  visibleOrigin?: string;
}

export function createProviderFactory({
  apiOrigin,
  createSyncTokenPath = createDocumentSyncTokenApiPath,
  visibleOrigin,
}: CollaborationEndpointOptions = {}): ProviderFactory {
  const resolveEndpoints = createEndpointResolver(apiOrigin, createSyncTokenPath);

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

    // Navigating away tears the session down mid-connect, which aborts the
    // in-flight token fetch (the browser cancels it). y-sweet's connect loop
    // `console.warn`s any token failure, so once this session is destroyed a
    // token failure is expected: hand y-sweet a never-settling promise instead
    // of rejecting, so it has nothing to warn about (its loop is already
    // neutralized by the `provider.connect` override below). This is per-session
    // — a failure is swallowed only for the session that owns this `destroyed`
    // flag, so it never suppresses a genuine failure on a still-live session
    // that shares the deduped in-flight token fetch.
    let destroyed = false;
    const authEndpoint = async (): Promise<ClientToken> => {
      try {
        const token = await getAuthToken(id, endpoints);
        return rewriteTokenHost(token, visibleOrigin);
      } catch (error) {
        if (destroyed) {
          return new Promise<ClientToken>(() => {});
        }
        throw error;
      }
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
    const destroyIndexedDbProvider = guardYSweetIndexedDbProviderLifecycle(
      provider as unknown as CollaborationProviderInstance & { indexedDBProvider?: unknown }
    );

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
      destroyIndexedDbProvider();
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

function createEndpointResolver(origin: string | undefined, createSyncTokenPath: (docId: string) => string) {
  const normalizedOrigin = origin ? origin.replace(TRAILING_SLASH_PATTERN, '') : '';
  const base = normalizedOrigin;

  return (docId: string) => {
    return {
      token: `${base}${createSyncTokenPath(docId)}`,
    };
  };
}

function getAuthToken(
  docId: string,
  endpoints: { token: string },
): Promise<ClientToken> {
  const cacheKey = `${endpoints.token}\0${docId}`;
  const existing = docTokenInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    trace('collab', 'requesting auth token', { docId });
    const response = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    if (!response.ok) {
      trace('collab', 'auth token request failed', { docId, status: response.status });
      throw new Error(`Failed to auth doc ${docId}: ${response.status} ${response.statusText}`);
    }

    trace('collab', 'auth token ready', { docId });
    return (await response.json()) as ClientToken;
  })();

  docTokenInFlight.set(cacheKey, promise);
  return promise.finally(() => {
    docTokenInFlight.delete(cacheKey);
  });
}

function rewriteTokenHost(token: ClientToken, visibleOrigin?: string): ClientToken {
  const baseOrigin = typeof location === 'undefined' ? undefined : location.origin;
  const targetOrigin = visibleOrigin ?? baseOrigin;
  if (!targetOrigin) {
    return token;
  }

  const browserVisibleUrl = new URL(targetOrigin, baseOrigin);
  if (browserVisibleUrl.hostname.length === 0) {
    return token;
  }

  const rewrite = (raw: string) => {
    const url = new URL(raw);
    url.hostname = browserVisibleUrl.hostname;
    url.port = browserVisibleUrl.port;
    const needsUpgrade = browserVisibleUrl.protocol === 'https:' && (url.protocol === 'ws:' || url.protocol === 'http:');
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
   * Optional total timeout in milliseconds. Defaults to 5000. Pass null to disable.
   */
  timeoutMs?: number | null;
  /**
   * Optional deadline, in milliseconds, for the connection to recover after a socket close.
   * Armed on `connection-close` and disarmed once the provider reports `connected` again, so a
   * healthy-but-slow sync (which never closes) is never capped. Defaults to 30000. Pass null to
   * wait indefinitely across closes.
   */
  reconnectTimeoutMs?: number | null;
  drainLocalChanges?: boolean;
}

const DEFAULT_RECONNECT_TIMEOUT_MS = 30_000;

/**
 * Wait until a collaboration provider reports `synced`, and optionally until it has no pending
 * local changes (hasLocalChanges === false).
 *
 * A socket close is normal on a reconnecting transport, so it does not fail the wait on its own:
 * the provider reconnects and we resolve on the next sync. Failures are a terminal connection
 * error, the caller's abort/`timeoutMs`, or a close that fails to reconnect within
 * `reconnectTimeoutMs`. The reconnect deadline only runs while disconnected, so a legitimately
 * slow initial sync over a live connection is never capped.
 *
 * Used by:
 * - CollaborationProvider (awaitSynced)
 * - snapshot CLI (save/load safety)
 */
export function waitForSync(
  provider: MinimalProviderEvents,
  {
    timeoutMs = 5000,
    reconnectTimeoutMs = DEFAULT_RECONNECT_TIMEOUT_MS,
    signal,
    drainLocalChanges = true,
  }: WaitForSyncOptions = {}
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

  const tracksReconnect = typeof reconnectTimeoutMs === 'number';

  return new Promise<void>((resolve, reject) => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Arm a recovery deadline on close; if the provider reports `connected` again before it
    // expires (onConnectionStatus), the close was transient and we keep waiting for the resync.
    function onClose(payload: unknown) {
      if (reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        finish(() => reject(createConnectionError(payload)));
      }, reconnectTimeoutMs as number);
    }

    function onConnectionStatus(payload: unknown) {
      if (payload === 'connected') {
        clearReconnectTimer();
      }
    }

    function clearReconnectTimer() {
      if (!reconnectTimer) {
        return;
      }
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    function cleanup() {
      clearReconnectTimer();
      provider.off('sync', onSyncLike);
      provider.off('connection-error', onError);
      if (tracksReconnect) {
        provider.off('connection-close', onClose);
        provider.off('connection-status', onConnectionStatus);
      }
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
    provider.on('connection-error', onError);
    if (tracksReconnect) {
      provider.on('connection-close', onClose);
      provider.on('connection-status', onConnectionStatus);
    }
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
