import type { Provider } from '@lexical/yjs';
import { WebsocketProvider, messageSync } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import { Awareness } from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => Provider;

export class CollaborationSyncController {
  private unsynced: boolean;
  private readonly setState: (value: boolean) => void;

  constructor(setState: (value: boolean) => void, initialValue: boolean) {
    this.setState = setState;
    this.unsynced = initialValue;
  }

  get current(): boolean {
    return this.unsynced;
  }

  setUnsynced(value: boolean) {
    if (this.unsynced === value) {
      return;
    }

    this.unsynced = value;
    this.setState(value);
  }
}

interface ProviderFactorySignals {
  setReady: (value: boolean) => void;
  syncController: CollaborationSyncController;
}

export function createProviderFactory(
  { setReady, syncController }: ProviderFactorySignals,
  endpoint: string
): ProviderFactory {
  if (shouldUseLocalCollaboration()) {
    return createLocalProviderFactory({ setReady, syncController });
  }

  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    const provider = new WebsocketProvider(endpoint, id, doc, {
      connect: false,
    });

    const detach = attachSyncTracking(provider, syncController);

    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        setReady(true);
      }
    });

    provider.on('status', (event: { status: string }) => {
      if (event.status === 'connecting') {
        setReady(false);
      }
    });

    const originalDestroy = provider.destroy.bind(provider);
    provider.destroy = () => {
      detach();
      originalDestroy();
    };

    return provider as unknown as Provider;
  };
}

function attachSyncTracking(provider: WebsocketProvider, controller: CollaborationSyncController) {
  let handshakePending = false;
  let pendingAck = false;

  const markUnsynced = () => {
    controller.setUnsynced(true);
  };

  const ensureHandshake = () => {
    if (handshakePending) {
      return;
    }

    const socket = provider.ws;

    if (!provider.wsconnected || socket == null) {
      return;
    }

    const openState =
      typeof WebSocket !== 'undefined'
        ? WebSocket.OPEN
        : socket.OPEN ?? 1;

    if (socket.readyState !== openState) {
      return;
    }

    handshakePending = true;
    pendingAck = false;
    controller.setUnsynced(true);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, provider.doc);

    try {
      provider.synced = false;
      socket.send(encoding.toUint8Array(encoder));
    } catch {
      handshakePending = false;
      pendingAck = true;
    }
  };

  const handleLocalUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin === provider) {
      return;
    }

    pendingAck = true;
    markUnsynced();

    ensureHandshake();
  };

  const handleSync = (isSynced: boolean) => {
    if (!isSynced) {
      return;
    }

    handshakePending = false;

    if (pendingAck) {
      ensureHandshake();
      return;
    }

    if (provider.wsconnected) {
      controller.setUnsynced(false);
    }
  };

  const handleStatus = ({ status }: { status: string }) => {
    if (status === 'connected') {
      if (pendingAck) {
        ensureHandshake();
      } else if (provider.synced) {
        controller.setUnsynced(false);
      }
      return;
    }

    // Connection dropped or paused: mark unsynced and retry once we reconnect.
    pendingAck = true;
    handshakePending = false;
    markUnsynced();
  };

  controller.setUnsynced(true);

  provider.doc.on('update', handleLocalUpdate);
  provider.on('sync', handleSync);
  provider.on('status', handleStatus);

  return () => {
    provider.doc.off('update', handleLocalUpdate);
    provider.off('sync', handleSync);
    provider.off('status', handleStatus);
  };
}

const LOCAL_COLLAB_FLAG = '__USE_LOCAL_COLLAB__';

function shouldUseLocalCollaboration(): boolean {
  if (typeof globalThis === 'undefined') {
    return false;
  }

  return Boolean((globalThis as Record<string, unknown>)[LOCAL_COLLAB_FLAG]);
}

function createLocalProviderFactory(signals: ProviderFactorySignals): ProviderFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    return new LocalCollaborationProvider(doc, signals) as unknown as Provider;
  };
}

type ListenerMap = {
  sync: Set<(isSynced: boolean) => void>;
  status: Set<(event: { status: string }) => void>;
  reload: Set<(doc: Y.Doc) => void>;
  update: Set<(payload: unknown) => void>;
};

class LocalCollaborationProvider {
  readonly awareness: Awareness;
  readonly doc: Y.Doc;
  synced = false;
  wsconnected = false;

  private readonly listeners: ListenerMap = {
    sync: new Set(),
    status: new Set(),
    reload: new Set(),
    update: new Set(),
  };
  private readonly signals: ProviderFactorySignals;
  private readonly handleDocUpdate: () => void;

  constructor(doc: Y.Doc, signals: ProviderFactorySignals) {
    this.doc = doc;
    this.signals = signals;
    this.awareness = new Awareness(doc);

    this.handleDocUpdate = () => {
      if (!this.wsconnected) {
        return;
      }

      queueMicrotask(() => {
        if (!this.wsconnected) {
          return;
        }

        this.synced = true;
        this.signals.syncController.setUnsynced(false);
      });
    };

    this.doc.on('update', this.handleDocUpdate);
  }

  connect(): void {
    if (this.wsconnected) {
      return;
    }

    this.wsconnected = true;
    this.emitStatus('connecting');

    queueMicrotask(() => {
      if (!this.wsconnected) {
        return;
      }

      this.synced = true;
      this.emitStatus('connected');
      this.emitSync(true);
      this.signals.syncController.setUnsynced(false);
      this.signals.setReady(true);
    });
  }

  disconnect(): void {
    if (!this.wsconnected) {
      return;
    }

    this.wsconnected = false;
    this.synced = false;
    this.emitStatus('disconnected');
  }

  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.handleDocUpdate);
    this.clearListeners();
  }

  on(event: 'sync', callback: (isSynced: boolean) => void): void;
  on(event: 'status', callback: (event: { status: string }) => void): void;
  on(event: 'reload', callback: (doc: Y.Doc) => void): void;
  on(event: 'update', callback: (payload: unknown) => void): void;
  on(event: keyof ListenerMap, callback: (...args: unknown[]) => void): void {
    (this.listeners[event] as Set<(...args: unknown[]) => void>).add(callback);
  }

  off(event: 'sync', callback: (isSynced: boolean) => void): void;
  off(event: 'status', callback: (event: { status: string }) => void): void;
  off(event: 'reload', callback: (doc: Y.Doc) => void): void;
  off(event: 'update', callback: (payload: unknown) => void): void;
  off(event: keyof ListenerMap, callback: (...args: unknown[]) => void): void {
    (this.listeners[event] as Set<(...args: unknown[]) => void>).delete(callback);
  }

  private emitSync(isSynced: boolean): void {
    for (const listener of this.listeners.sync) {
      listener(isSynced);
    }
  }

  private emitStatus(status: string): void {
    for (const listener of this.listeners.status) {
      listener({ status });
    }
  }

  private clearListeners(): void {
    this.listeners.sync.clear();
    this.listeners.status.clear();
    this.listeners.reload.clear();
    this.listeners.update.clear();
  }
}
