import type * as Y from 'yjs';

import {
  asCollaborationProviderEvents,
  createProviderFactory,
  toCollaborationConnectionStatus,
  waitForSync,
} from './runtime';
import { trace } from '#lib/log';
import type {
  CollaborationConnectionStatus,
  CollaborationProviderInstance,
  CollaborationSessionProvider,
  MinimalProviderEvents,
  ProviderFactory,
  ProviderFactoryResult,
} from './runtime';

interface CollabSnapshot {
  docId: string;
  hydrated: boolean;
  synced: boolean;
  localCacheHydrated: boolean;
  connectionStatus: CollaborationConnectionStatus;
  docEpoch: number;
  enabled: boolean;
}

type Listener = () => void;

interface SessionOptions {
  origin?: string;
  enabled: boolean;
  docId: string;
  providerFactory?: ProviderFactory;
}

type ManagedProvider = (CollaborationSessionProvider & MinimalProviderEvents) | null;

function isLocalCacheHydratedDoc(doc: Y.Doc): boolean {
  return doc.store.clients.size > 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLocalCacheUpdateOrigin(origin: unknown, provider: CollaborationSessionProvider): boolean {
  const indexedDBProvider = (provider as { indexedDBProvider?: unknown }).indexedDBProvider;
  if (indexedDBProvider !== undefined && origin === indexedDBProvider) {
    return true;
  }

  if (!isObjectRecord(origin)) {
    return false;
  }

  return origin.source === 'local-cache';
}

function isProviderFactoryPromise(
  value: ProviderFactoryResult | Promise<ProviderFactoryResult>
): value is Promise<ProviderFactoryResult> {
  return typeof (value as Promise<ProviderFactoryResult>).then === 'function';
}

/**
 * Headless collaboration session that owns provider lifecycle and readiness state.
 * React components subscribe via `subscribe` / `snapshot`; headless callers can use
 * `awaitSynced` directly. No DOM assumptions.
 */
export class CollabSession {
  readonly enabled: boolean;

  private providerFactory: ProviderFactory;
  private provider: ManagedProvider = null;
  private listeners = new Set<Listener>();
  private awaitController: AbortController | null = null;
  private cleanup: (() => void) | null = null;
  private attachTask: Promise<void> | null = null;
  private attachVersion = 0;
  private state: CollabSnapshot;

  constructor(options: SessionOptions) {
    const { origin, enabled, docId, providerFactory } = options;
    this.enabled = enabled;
    this.providerFactory = providerFactory ?? createProviderFactory(origin);
    this.state = {
      docId,
      hydrated: !enabled,
      synced: !enabled,
      localCacheHydrated: !enabled,
      connectionStatus: enabled ? 'connecting' : 'disconnected',
      docEpoch: 0,
      enabled,
    };
  }

  snapshot(): CollabSnapshot {
    return this.state;
  }

  getProvider(): CollaborationProviderInstance | null {
    return this.provider as CollaborationProviderInstance | null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setDocId(docId: string) {
    if (docId === this.state.docId) return;
    trace('collab', 'switching document', { from: this.state.docId, to: docId });
    this.teardown();
    this.state = {
      ...this.state,
      docId,
      hydrated: !this.enabled,
      synced: !this.enabled,
      localCacheHydrated: !this.enabled,
      connectionStatus: this.enabled ? 'connecting' : 'disconnected',
      docEpoch: this.state.docEpoch, // increment on attach
    };
    this.notify();
  }

  attach(docMap: Map<string, Y.Doc>): void {
    if (!this.enabled) {
      throw new Error('Collaboration disabled');
    }

    this.teardown();
    const attachVersion = this.attachVersion + 1;
    this.attachVersion = attachVersion;
    const docId = this.state.docId;
    trace('collab', 'session attach', { docId });

    const handleAttachFailure = (error: unknown) => {
      if (attachVersion !== this.attachVersion) {
        return;
      }
      trace('collab', 'session attach failed', {
        docId,
        message: error instanceof Error ? error.message : String(error),
      });
      this.state = {
        ...this.state,
        hydrated: false,
        synced: false,
        localCacheHydrated: false,
        connectionStatus: 'error',
      };
      this.notify();
    };

    const applyProviderResult = ({ provider, doc }: ProviderFactoryResult) => {
      if (attachVersion !== this.attachVersion) {
        provider.destroy();
        return;
      }

      const events = asCollaborationProviderEvents(provider);
      this.provider = events;
      this.awaitController = new AbortController();

      const recomputeState = (
        patch: Partial<CollabSnapshot> = {},
        options: { forceUnsynced?: boolean } = {}
      ) => {
        const base = { ...this.state, ...patch };
        const hydrated = base.hydrated || base.localCacheHydrated || events.synced === true;
        const computedSynced = hydrated && events.synced === true && events.hasLocalChanges !== true;
        const synced = options.forceUnsynced ? false : computedSynced;
        const nextState: CollabSnapshot = { ...base, hydrated, synced };
        if (
          nextState.docId === this.state.docId &&
          nextState.hydrated === this.state.hydrated &&
          nextState.synced === this.state.synced &&
          nextState.localCacheHydrated === this.state.localCacheHydrated &&
          nextState.connectionStatus === this.state.connectionStatus &&
          nextState.docEpoch === this.state.docEpoch &&
          nextState.enabled === this.state.enabled
        ) {
          return;
        }
        this.state = nextState;
        this.notify();
      };

      const handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
        if (this.state.localCacheHydrated) return;
        if (!isLocalCacheUpdateOrigin(origin, provider)) return;
        trace('collab', 'local cache hydrated from local document updates', { docId: this.state.docId });
        recomputeState({ localCacheHydrated: true });
      };

      const updateFromProvider = () => {
        recomputeState();
      };

      const handleConnectionStatus = () => {
        const nextStatus = toCollaborationConnectionStatus(provider.status);
        if (nextStatus !== this.state.connectionStatus) {
          trace('collab', 'connection status changed', {
            docId: this.state.docId,
            from: this.state.connectionStatus,
            to: nextStatus,
          });
        }
        recomputeState({ connectionStatus: nextStatus });
      };

      const handleConnectionError = () => {
        trace('collab', 'connection error', { docId: this.state.docId });
        recomputeState({ connectionStatus: 'error' }, { forceUnsynced: true });
      };

      const handleConnectionClose = () => {
        trace('collab', 'connection closed', { docId: this.state.docId });
        recomputeState({ connectionStatus: 'disconnected' }, { forceUnsynced: true });
      };

      doc.on('update', handleDocUpdate);
      events.on('sync', updateFromProvider);
      events.on('local-changes', updateFromProvider);
      events.on('connection-status', handleConnectionStatus);
      events.on('connection-close', handleConnectionClose);
      events.on('connection-error', handleConnectionError);

      this.cleanup = () => {
        doc.off('update', handleDocUpdate);
        events.off('sync', updateFromProvider);
        events.off('local-changes', updateFromProvider);
        events.off('connection-status', handleConnectionStatus);
        events.off('connection-close', handleConnectionClose);
        events.off('connection-error', handleConnectionError);
      };

      recomputeState({
        hydrated: false,
        synced: false,
        localCacheHydrated: isLocalCacheHydratedDoc(doc),
        connectionStatus: toCollaborationConnectionStatus(provider.status),
        docEpoch: this.state.docEpoch + 1,
      });
    };

    const result = this.providerFactory(docId, docMap);
    if (!isProviderFactoryPromise(result)) {
      try {
        applyProviderResult(result);
      } catch (error) {
        handleAttachFailure(error);
      }
      return;
    }

    const task = result.then(applyProviderResult).catch(handleAttachFailure);
    const trackedTask = task.finally(() => {
      if (this.attachTask === trackedTask) {
        this.attachTask = null;
      }
    });
    this.attachTask = trackedTask;
  }

  detach() {
    this.teardown();
    if (!this.enabled) return;
    this.state = {
      ...this.state,
      hydrated: false,
      synced: false,
      localCacheHydrated: false,
      connectionStatus: 'disconnected',
    };
    this.notify();
  }

  async awaitSynced() {
    if (!this.enabled) {
      return;
    }
    if (this.attachTask) {
      await this.attachTask;
    }
    if (!this.provider || !this.awaitController) {
      throw new Error('Collaboration provider unavailable');
    }
    return waitForSync(this.provider, { signal: this.awaitController.signal, timeoutMs: null });
  }

  destroy() {
    this.teardown(true);
    this.listeners.clear();
  }

  private teardown(abortAwait = false) {
    this.attachVersion += 1;
    this.attachTask = null;
    this.cleanup?.();
    this.cleanup = null;

    if (abortAwait) {
      this.awaitController?.abort(new Error('Collaboration session destroyed'));
    } else {
      this.awaitController?.abort();
    }
    this.awaitController = null;

    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
  }

  private notify() {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
