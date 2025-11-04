import type { Provider } from '@lexical/yjs';
import { WebsocketProvider, messageSync } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

export type CollaborationProviderInstance = Provider & { destroy: () => void };

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => CollaborationProviderInstance;

export class CollaborationSyncController {
  private readonly setState: (value: boolean) => void;

  constructor(setState: (value: boolean) => void) {
    this.setState = setState;
  }

  setSyncing(value: boolean) {
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

    // Ensure the shared root exists before the provider starts syncing. Yjs warns when
    // collaborative types are accessed prior to being attached to a document, and
    // Lexical expects the `root` XmlText to always be present.
    doc.get('root', Y.XmlText);

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
    const destroy = () => {
      detach();
      originalDestroy();
    };

    return Object.assign(provider as unknown as Provider, { destroy }) as CollaborationProviderInstance;
  };
}

function attachSyncTracking(provider: WebsocketProvider, controller: CollaborationSyncController) {
  let handshakePending = false;
  let pendingAck = false;

  const markSyncing = () => {
    controller.setSyncing(true);
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
    controller.setSyncing(true);

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
    markSyncing();

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
      controller.setSyncing(false);
    }
  };

  const handleStatus = ({ status }: { status: string }) => {
    if (status === 'connected') {
      if (pendingAck) {
        ensureHandshake();
      } else if (provider.synced) {
        controller.setSyncing(false);
      }
      return;
    }

    // Connection dropped or paused: mark unsynced and retry once we reconnect.
    pendingAck = true;
    handshakePending = false;
    markSyncing();
  };

  controller.setSyncing(true);

  provider.doc.on('update', handleLocalUpdate);
  provider.on('sync', handleSync);
  provider.on('status', handleStatus);

  return () => {
    provider.doc.off('update', handleLocalUpdate);
    provider.off('sync', handleSync);
    provider.off('status', handleStatus);
  };
}
