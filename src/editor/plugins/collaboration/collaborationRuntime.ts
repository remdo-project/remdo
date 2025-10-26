import type { Provider } from '@lexical/yjs';
import { env } from '#config/env-client';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => Provider;

export function createProviderFactory(setReady: (value: boolean) => void, endpoint: string): ProviderFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    const doc = getOrCreateDoc(id, docMap);
    const room = resolveRoom(id);
    const provider = new WebsocketProvider(endpoint, room, doc, {
      connect: false,
    });

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

    return provider as unknown as Provider;
  };
}

export function resolveDefaultEndpoint(): string {
  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  return `${wsProtocol}://${hostname}:${env.collabPort}`;
}

const ROOM_SUFFIX = '-3';

export function resolveRoom(id: string): string {
  return `${id}${ROOM_SUFFIX}`;
}

function getOrCreateDoc(id: string, docs: Map<string, Y.Doc>): Y.Doc {
  let doc = docs.get(id);
  if (!doc) {
    doc = new Y.Doc();
    //TODO do we need that?
    //doc.get('root', Y.XmlText);
    docs.set(id, doc);
  }
  return doc;
}
