import type { Provider } from '@lexical/yjs';
import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider';
import { trace } from '#platform/log';
import { createLocalPersistence } from './local-persistence';
import type { LocalPersistence } from './local-persistence';
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

export type LocalPersistenceStatus = 'disabled' | 'loading' | 'enabled' | 'error';

export interface CollaborationSessionProvider extends CollaborationProviderInstance {
  synced?: boolean;
  hasLocalChanges?: boolean;
  status: CollaborationProviderConnectionStatus;
  localPersistenceStatus?: LocalPersistenceStatus;
}

export type CollaborationProviderEventsView = CollaborationSessionProvider & MinimalProviderEvents;

export interface ProviderFactoryResult {
  provider: CollaborationSessionProvider;
  doc: Y.Doc;
}

export type ProviderFactory = (
  id: string,
  docMap: Map<string, Y.Doc>
) => ProviderFactoryResult;

export function asCollaborationProviderEvents(provider: CollaborationSessionProvider): CollaborationProviderEventsView {
  return provider as CollaborationProviderEventsView;
}

export function toCollaborationConnectionStatus(
  status: CollaborationProviderConnectionStatus
): CollaborationConnectionStatus {
  return status === 'offline' ? 'disconnected' : status;
}

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

  if (typeof navigator === 'undefined' || !('locks' in navigator) || typeof BroadcastChannel === 'undefined') {
    return { enabled: false, reason: 'storage coordination unavailable' };
  }
  try {
    localStorage.setItem(LOCAL_PERSISTENCE_PROBE_DB, '1');
    localStorage.removeItem(LOCAL_PERSISTENCE_PROBE_DB);
  } catch {
    return { enabled: false, reason: 'localStorage unavailable' };
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
  } catch {
    trace('collab', 'local persistence probe failed');
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
  visibleOrigin?: string;
  accountId?: string;
  WebSocketPolyfill?: typeof WebSocket;
}

class LexicalNetworkProvider extends HocuspocusProvider {
  notify(event: string, payload: unknown) {
    this.emit(event, payload);
  }
}

class SessionWebsocket extends HocuspocusProviderWebsocket {
  // TODO: Remove when Hocuspocus reconciles queued updates with its reset sync
  // counter. Probe: reconnect acknowledgement browser regression. Full sync and
  // awareness on open already reconstruct the current document and presence.
  override send(message: Parameters<HocuspocusProviderWebsocket['send']>[0]) {
    if (this.webSocket?.readyState === 1) super.send(message);
  }

  // TODO: Remove when Hocuspocus safely detaches pending sockets. Probe: native
  // and ws transports in provider-headless-lifecycle.spec.ts and browser departure.
  override cleanupWebSocket() {
    const socket = this.webSocket;
    if (!socket) return;
    const handlers = this.webSocketHandlers[socket.identifier] as Record<string, EventListener>;
    for (const [event, handler] of Object.entries(handlers)) socket.removeEventListener(event, handler);
    delete this.webSocketHandlers[socket.identifier];
    this.webSocket = null;
    socket.addEventListener('error', () => {}, { once: true });
    if (socket.readyState === 0 && typeof window !== 'undefined' && !('terminate' in socket)) {
      socket.addEventListener('open', () => socket.close(), { once: true });
    } else socket.close();
  }

  override disconnect() {
    this.shouldConnect = false;
    this.stopConnectionAttempt();
    this.cleanupWebSocket();
    this.status = WebSocketStatus.Disconnected;
    this.emit('close', { event: { code: 1000, reason: '' } });
  }
}

export function createProviderFactory({ visibleOrigin, accountId, WebSocketPolyfill }: CollaborationEndpointOptions = {}): ProviderFactory {
  return (id, docMap) => {
    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }
    doc.get('root', Y.XmlText);
    const url = new URL('/collaboration', visibleOrigin ?? location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const websocket = new SessionWebsocket({
      url: url.href,
      autoConnect: false,
      ...(WebSocketPolyfill ? { WebSocketPolyfill } : {}),
    });
    const network = new LexicalNetworkProvider({ name: id, document: doc, websocketProvider: websocket });
    let status: CollaborationProviderConnectionStatus = 'offline';
    let localPersistenceStatus: LocalPersistenceStatus = accountId ? 'loading' : 'disabled';
    let destroyed = false;
    const isDestroyed = () => destroyed;
    let active = false;
    let restore = false;
    let persistence: LocalPersistence | undefined;
    let persistenceReady: Promise<void> | undefined;
    let pendingConnection: Promise<void> | null = null;
    let cancelConnection: (() => void) | undefined;
    const originalDestroy = network.destroy.bind(network);
    const provider = Object.assign(network, {
      connect: () => {
        if (destroyed) return Promise.resolve();
        if (pendingConnection) return pendingConnection;
        active = true;
        let wasCancelled = false;
        const cancelled = new Promise<void>((resolve) => {
          cancelConnection = () => { wasCancelled = true; resolve(); };
        });
        // Lexical installs its Yjs observer before calling connect. Hydrating in
        // the factory would make the editor miss the cached tree entirely.
        persistenceReady ??= initializePersistence();
        const connection = persistenceReady.then(() => {
          if (!wasCancelled && !destroyed) return websocket.connect();
        }).catch(() => {
          if (!wasCancelled && !destroyed) {
            status = 'error';
            network.notify('connection-error', { reason: 'Collaboration connection failed.' });
          }
        });
        const attempt = Promise.race([connection, cancelled]).then(() => {}).finally(() => {
          if (pendingConnection === attempt) {
            pendingConnection = null;
            cancelConnection = undefined;
          }
        });
        pendingConnection = attempt;
        return attempt;
      },
      disconnect: () => {
        active = false;
        cancelConnection?.();
        pendingConnection = null;
        websocket.disconnect();
        status = 'offline';
        network.notify('connection-status', status);
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        active = false;
        cancelConnection?.();
        pendingConnection = null;
        if (typeof window !== 'undefined') {
          window.removeEventListener('pagehide', pageHide);
          window.removeEventListener('pageshow', pageShow);
        }
        originalDestroy();
        websocket.destroy();
        void persistence?.destroy().catch(() => trace('collab', 'local persistence close failed'));
      },
    });
    Object.defineProperties(provider, {
      status: { get: () => status },
      localPersistenceStatus: { get: () => localPersistenceStatus },
      hasLocalChanges: { get: () => network.hasUnsyncedChanges },
    });
    network.on('synced', ({ state }: { state: boolean }) => network.notify('sync', state));
    network.on('unsyncedChanges', () => network.notify('local-changes', network.hasUnsyncedChanges));
    network.on('status', ({ status: next }: { status: string }) => {
      status = next === 'disconnected' ? 'offline' : next === 'connected' ? 'connected' : 'connecting';
      network.notify('connection-status', status);
    });
    network.on('close', (event: unknown) => network.notify('connection-close', event));
    network.on('authenticationFailed', ({ reason }: { reason: string }) => {
      if (reason === 'collaboration.service-unavailable') {
        // Keep the native reconnect policy active for temporary Django outages.
        websocket.webSocket?.close();
        return;
      }
      websocket.disconnect();
      status = 'error';
      network.notify('connection-error', { reason: 'Document access denied.' });
    });
    function pageHide() {
      restore = active;
      provider.disconnect();
    }
    function pageShow(event: PageTransitionEvent) {
      if (event.persisted && restore) {
        restore = false;
        void provider.connect();
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', pageHide);
      window.addEventListener('pageshow', pageShow);
    }
    function updatePersistenceStatus(next: LocalPersistenceStatus) {
      localPersistenceStatus = next;
      network.notify('local-persistence-status', next);
    }
    async function initializePersistence() {
      if (!accountId || destroyed) return;
      try {
        if (!(await getLocalPersistenceSupportDecision()).enabled) {
          updatePersistenceStatus('disabled');
          return;
        }
        if (isDestroyed()) return;
        persistence = createLocalPersistence(id, doc!, {
          accountId,
          onRevoked: () => provider.destroy(),
          onError: () => {
            updatePersistenceStatus('error');
            trace('collab', 'local persistence failed');
          },
        });
        await persistence.whenSynced;
        if (!isDestroyed()) updatePersistenceStatus('enabled');
      } catch {
        updatePersistenceStatus('error');
        await persistence?.destroy().catch(() => {});
        // Local storage is best-effort. Leave corrupt bytes untouched and allow
        // the authorized server to synchronize independently of storage.
      }
    }
    network.attach();
    return { provider: provider as unknown as CollaborationSessionProvider, doc };
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
