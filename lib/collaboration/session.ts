import type * as Y from 'yjs';

import { createProviderFactory, waitForSync } from './runtime';
import type { CollaborationProviderInstance, MinimalProviderEvents, ProviderFactory } from './runtime';

interface CollabSnapshot {
  docId: string;
  hydrated: boolean;
  synced: boolean;
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

type ManagedProvider = (MinimalProviderEvents & { destroy: () => void }) | null;

/**
 * Headless collaboration session that owns provider lifecycle and readiness state.
 * React components subscribe via `subscribe` / `snapshot`; headless callers can use
 * `awaitSynced` directly. No DOM assumptions.
 */
export class CollabSession {
  readonly enabled: boolean;

  private providerFactory: ProviderFactory;
  private provider: ManagedProvider = null;
  private docMap: Map<string, Y.Doc> | null = null;
  private listeners = new Set<Listener>();
  private awaitController: AbortController | null = null;
  private cleanup: (() => void) | null = null;
  private state: CollabSnapshot;

  constructor(options: SessionOptions) {
    const { origin, enabled, docId, providerFactory } = options;
    this.enabled = enabled;
    this.providerFactory = providerFactory ?? createProviderFactory(origin);
    this.state = {
      docId,
      hydrated: !enabled,
      synced: !enabled,
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
    this.teardown();
    this.state = {
      ...this.state,
      docId,
      hydrated: !this.enabled,
      synced: !this.enabled,
      docEpoch: this.state.docEpoch, // increment on attach
    };
    this.notify();
  }

  attach(docMap: Map<string, Y.Doc>): { provider: CollaborationProviderInstance; doc: Y.Doc } | null {
    if (!this.enabled) {
      return null;
    }

    this.teardown();
    this.docMap = docMap;
    const provider = this.providerFactory(this.state.docId, docMap);
    const doc = docMap.get(this.state.docId);
    if (!doc) {
      throw new Error(`Collaboration doc not found for id ${this.state.docId}`);
    }

    this.provider = provider as ManagedProvider;
    this.awaitController = new AbortController();

    this.state = {
      ...this.state,
      hydrated: false,
      synced: false,
      docEpoch: this.state.docEpoch + 1,
    };
    this.notify();

    const events = provider as unknown as MinimalProviderEvents & { synced?: boolean; hasLocalChanges?: boolean };

    const updateFromProvider = () => {
      const hydrated = this.state.hydrated || events.synced === true;
      const synced = hydrated && events.synced === true && events.hasLocalChanges !== true;
      if (hydrated === this.state.hydrated && synced === this.state.synced) {
        return;
      }
      this.state = { ...this.state, hydrated, synced };
      this.notify();
    };

    const handleError = () => {
      if (!this.state.synced) return;
      this.state = { ...this.state, synced: false };
      this.notify();
    };

    events.on('sync', updateFromProvider);
    events.on('local-changes', updateFromProvider);
    events.on('connection-close', handleError);
    events.on('connection-error', handleError);

    this.cleanup = () => {
      events.off('sync', updateFromProvider);
      events.off('local-changes', updateFromProvider);
      events.off('connection-close', handleError);
      events.off('connection-error', handleError);
    };

    // Catch provider already synced before listeners.
    updateFromProvider();

    return { provider, doc };
  }

  detach() {
    this.teardown();
    if (!this.enabled) return;
    this.state = {
      ...this.state,
      hydrated: false,
      synced: false,
    };
    this.notify();
  }

  async awaitSynced() {
    if (!this.enabled) {
      return;
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
    this.docMap = null;
  }

  private notify() {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
