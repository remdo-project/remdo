import type { Provider } from '@lexical/yjs';
import { WebsocketProvider, messageSync } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => Provider;

export class CollaborationSyncController {
  private unsynced: boolean;
  private readonly setState: (value: boolean) => void;
  private generation: number;

  constructor(setState: (value: boolean) => void, initialValue: boolean) {
    this.setState = setState;
    this.unsynced = initialValue;
    this.generation = 0;
  }

  get current(): boolean {
    return this.unsynced;
  }

  get version(): number {
    return this.generation;
  }

  setUnsynced(value: boolean) {
    if (this.unsynced === value) {
      return;
    }

    if (value) {
      this.generation += 1;
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
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    doc.get('root', Y.XmlText);

    const provider = new WebsocketProvider(endpoint, id, doc, {
      connect: false,
    });

    const detach = attachSyncTracking(provider, syncController);
    const originalDisconnect = provider.disconnect.bind(provider);
    provider.disconnect = () => {
      // Prevent lexical-vue from tearing down the socket during reactive re-renders.
    };

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
      provider.disconnect = originalDisconnect;
      originalDisconnect();
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
