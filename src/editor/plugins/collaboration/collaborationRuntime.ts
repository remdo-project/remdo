import type { Provider } from '@lexical/yjs';
import { WebsocketProvider, messageSync } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

export interface CollaborationSession {
  doc: Y.Doc;
  provider: Provider;
  detach: () => void;
}

export type CollaborationSessionFactory = (
  id: string,
  docMap: Map<string, Y.Doc>
) => CollaborationSession;

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

interface SessionFactorySignals {
  setReady: (value: boolean) => void;
  syncController: CollaborationSyncController;
}

export function createSessionFactory(
  { setReady, syncController }: SessionFactorySignals,
  endpoint: string
): CollaborationSessionFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
      initializeDocument(doc);
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

    return {
      doc,
      provider: provider as unknown as Provider,
      detach,
    };
  };
}

function initializeDocument(doc: Y.Doc) {
  doc.get('root-v2', Y.XmlElement);
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
